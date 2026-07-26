import type { IndexedDbCloudHydrationCommitter } from "../../../infrastructure/indexed-db/cloud-hydration-committer";
import type { CloudHydrationMetadataRepository } from "../../../infrastructure/indexed-db/cloud-hydration-metadata-repository";
import type { LocalDataOwnerRepository } from "../../../infrastructure/indexed-db/local-data-owner-repository";
import type { CloudPage } from "../../../types/cloud-learning-state";
import type { CloudLearningStateRepository } from "../repositories/cloud-learning-state-repository";

export interface CloudHydrationDependencies {
  ownerRepository: LocalDataOwnerRepository;
  cloudRepository: CloudLearningStateRepository;
  committer: IndexedDbCloudHydrationCommitter;
  metadataRepository: CloudHydrationMetadataRepository;
  hydrateSettings: (userId: string) => Promise<void>;
  now: () => Date;
}

export interface CloudHydrationResult {
  attempts: { inserted: number; preservedPending: number };
  mastery: { applied: number; skippedNewer: number };
  reviews: { applied: number; skippedNewer: number };
}

/**
 * Downloads every page of an entity from its saved cursor and commits
 * each one as it arrives, accumulating totals across all pages. Every
 * *_COLUMNS-style page contract guarantees hasMore/nextCursor stay in
 * sync; a page violating that (hasMore with a null cursor) would silently
 * truncate hydration on the next run, so it aborts immediately instead.
 */
async function downloadAllPages<TItem, TCursor, TTotal>(
  label: string,
  initialCursor: TCursor | null,
  fetchPage: (cursor: TCursor | null) => Promise<CloudPage<TItem, TCursor>>,
  commitPage: (
    items: readonly TItem[],
    nextCursor: TCursor | null,
  ) => Promise<TTotal>,
  accumulate: (total: TTotal, pageTotal: TTotal) => TTotal,
  initialTotal: TTotal,
): Promise<TTotal> {
  let cursor = initialCursor;
  let total = initialTotal;

  for (;;) {
    const page = await fetchPage(cursor);
    if (page.hasMore && page.nextCursor === null) {
      throw new Error(
        `${label} page reported hasMore with a null cursor.`,
      );
    }

    const pageTotal = await commitPage(page.items, page.nextCursor);
    total = accumulate(total, pageTotal);

    if (!page.hasMore) {
      return total;
    }
    cursor = page.nextCursor;
  }
}

/**
 * Downloads this account's cloud learning state into the local database.
 * Deliberately download-only: it never uploads pending Attempts (the Sync
 * Store owns upload-first coordination) and never touches GuestSyncService.
 */
export class CloudHydrationService {
  public constructor(
    private readonly dependencies: CloudHydrationDependencies,
  ) {}

  public async downloadState(userId: string): Promise<CloudHydrationResult> {
    const {
      ownerRepository,
      cloudRepository,
      committer,
      metadataRepository,
      hydrateSettings,
      now,
    } = this.dependencies;

    await ownerRepository.bind(userId);
    await hydrateSettings(userId);
    const metadata = await metadataRepository.get(userId);
    const revisions = await committer.captureProjectionRevisions();

    const attempts = await downloadAllPages(
      "Attempt",
      metadata.attemptsCursor,
      (cursor) => cloudRepository.listAttemptsPage(cursor),
      (items, nextCursor) =>
        committer.commitAttemptsPage({ userId, items, nextCursor }),
      (total, pageTotal) => ({
        inserted: total.inserted + pageTotal.inserted,
        preservedPending: total.preservedPending + pageTotal.preservedPending,
      }),
      { inserted: 0, preservedPending: 0 },
    );

    const mastery = await downloadAllPages(
      "Mastery",
      metadata.masteryCursor,
      (cursor) => cloudRepository.listMasteryPage(cursor),
      (items, nextCursor) =>
        committer.commitMasteryPage({
          userId,
          items,
          nextCursor,
          expectedRevisions: revisions.masteryBySkillId,
        }),
      (total, pageTotal) => ({
        applied: total.applied + pageTotal.applied,
        skippedNewer: total.skippedNewer + pageTotal.skippedNewer,
      }),
      { applied: 0, skippedNewer: 0 },
    );

    const reviews = await downloadAllPages(
      "Review",
      metadata.reviewsCursor,
      (cursor) => cloudRepository.listReviewsPage(cursor),
      (items, nextCursor) =>
        committer.commitReviewsPage({
          userId,
          items,
          nextCursor,
          expectedRevisions: revisions.reviewsByExerciseId,
        }),
      (total, pageTotal) => ({
        applied: total.applied + pageTotal.applied,
        skippedNewer: total.skippedNewer + pageTotal.skippedNewer,
      }),
      { applied: 0, skippedNewer: 0 },
    );

    await metadataRepository.markCompleted(userId, now().toISOString());

    return { attempts, mastery, reviews };
  }
}
