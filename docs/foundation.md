# Foundation Interfaces

The foundation shell leaves feature agents a small set of stable interfaces.

## Routes

`app/(tabs)` provides the four required tabs: Tracker, Habits, Insights, and
Settings. The root stack reserves routes for folders, history, activities,
routines, habits, folder editing, and backup. Routine routes live outside the
tab group, so the normal tab bar is not part of the routine runner surface.

## Screen Composition

Import `Screen` from `@ui` for every feature screen. It supplies a Universal
`@expo/ui` `Host`, automatic light/dark/system scheme handling, semantic theme
colors, and an optional Universal `ScrollView`. Place feature layout inside
Universal `Column` and `Row` primitives; use `List`, `Text`, and `Button` as
needed. Use `RNHostView` only when a React Native or third-party view must be
embedded because no Universal primitive can represent it.

## Visual Data Boundaries

`IconName` values and `iconCatalog` metadata live in `@icons/icon-names` and
contain no React components. `AppIcon` maps the curated names to
`lucide-react-native` components at the UI boundary. `@theme` provides
light/dark/system resolution, readable text selection for hex backgrounds,
semantic color pairs, and active/inactive visuals with both icon and label
signals.
