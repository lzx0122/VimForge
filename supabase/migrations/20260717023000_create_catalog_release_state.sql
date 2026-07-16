-- Adoption migration: release metadata is private and does not alter catalog rows.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.catalog_release_state (
  singleton boolean primary key default true check (singleton = true),
  revision bigint not null check (revision > 0),
  catalog_hash text not null
    check (catalog_hash ~ '^sha256:[0-9a-f]{64}$'),
  published_at timestamptz not null
);

revoke all on table private.catalog_release_state from public, anon, authenticated;

-- This is the verified repository catalog snapshot adopted by this release.
-- The row is deliberately inserted once; the singleton key prevents a second state row.
insert into private.catalog_release_state (singleton, revision, catalog_hash, published_at)
values (
  true,
  1,
  'sha256:d97a6d3d372da58e41a608e7fed0daf4a306eedb6a2f39abd69bb2ba4d07858a',
  now()
);
