import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type RouterHistory,
} from "vue-router";

import AuthCallbackPage from "../../features/auth/pages/AuthCallbackPage.vue";
import CourseUnitPage from "../../features/course/pages/CourseUnitPage.vue";
import CoursesPage from "../../features/course/pages/CoursesPage.vue";
import NotFoundPage from "../../features/errors/pages/NotFoundPage.vue";
import HomePage from "../../features/home/pages/HomePage.vue";
import PracticePage from "../../features/practice/pages/PracticePage.vue";
import PracticeResultPage from "../../features/practice/pages/PracticeResultPage.vue";
import PracticeSetupPage from "../../features/practice/pages/PracticeSetupPage.vue";
import ProgressPage from "../../features/progress/pages/ProgressPage.vue";
import ReviewPage from "../../features/review/pages/ReviewPage.vue";
import SettingsPage from "../../features/settings/pages/SettingsPage.vue";

export const routes = [
  { path: "/", name: "home", component: HomePage },
  { path: "/courses", name: "courses", component: CoursesPage },
  {
    path: "/courses/:unitSlug",
    name: "course-unit",
    component: CourseUnitPage,
  },
  {
    path: "/practice/setup",
    name: "practice-setup",
    component: PracticeSetupPage,
  },
  {
    path: "/practice/:sessionId",
    name: "practice",
    component: PracticePage,
  },
  {
    path: "/practice/:sessionId/result",
    name: "practice-result",
    component: PracticeResultPage,
  },
  { path: "/review", name: "review", component: ReviewPage },
  { path: "/progress", name: "progress", component: ProgressPage },
  { path: "/settings", name: "settings", component: SettingsPage },
  {
    path: "/auth/callback",
    name: "auth-callback",
    component: AuthCallbackPage,
  },
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: NotFoundPage,
  },
] satisfies RouteRecordRaw[];

export function createAppRouter(
  history: RouterHistory = createWebHistory(),
) {
  return createRouter({ history, routes });
}
