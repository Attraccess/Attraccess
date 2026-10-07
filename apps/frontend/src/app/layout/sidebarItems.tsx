// Takes LucideProps like every other sidebar icon, so callers can size it the same way. `size` is
// lucide-only and would land on the <svg> as an invalid attribute, so it is translated here.
export { type SidebarItem } from './sidebarItems.contracts';
export { type SidebarItemGroup } from './sidebarItems.contracts';
export { SIDEBAR_ITEMS } from './sidebarItems.sidebar-items';
export { useSidebarItems } from './sidebarItems.use-sidebar-items';
export { useSidebarEndItems } from './sidebarItems.state';
export { buildSidebarEndItems } from './sidebarItems.state';
