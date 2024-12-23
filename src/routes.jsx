import Home from "./pages/home";
import Settings from "./pages/settings";
import Users from "./pages/users";
import UserInfo from "./pages/components/user-info";
import Libraries from "./pages/libraries";
import LibraryInfo from "./pages/components/library-info";
import ItemInfo from "./pages/components/item-info";
import About from "./pages/about";
import TestingRoutes from "./pages/testing";
import Activity from "./pages/activity";
import Statistics from "./pages/statistics";
import DeletionRules from "./pages/deletion_rules";

const routes = [
  {
    path: "/",
    element: <Home />,
    exact: true,
  },
  {
    path: "/settings",
    element: <Settings />,
    exact: true,
  },
  {
    path: "/users",
    element: <Users />,
    exact: true,
  },
  {
    path: "/users/:UserId",
    element: <UserInfo />,
    exact: true,
  },
  {
    path: "/libraries",
    element: <Libraries />,
    exact: true,
  },
  {
    path: "/libraries/:LibraryId",
    element: <LibraryInfo />,
    exact: true,
  },
  {
    path: "/libraries/item/:Id",
    element: <ItemInfo />,
    exact: true,
  },
  {
    path: "/statistics",
    element: <Statistics />,
    exact: true,
  },
  {
    path: "/activity",
    element: <Activity />,
    exact: true,
  },
  {
    path: "/deletion-rules",
    element: <DeletionRules />,
    exact: true,
  },
  {
    path: "/about",
    element: <About />,
    exact: true,
  },
  {
    path: "/testing/*",
    element: <TestingRoutes />,
    exact: true,
  },
];

export default routes;
