import {
  Activity,
  BarChart3,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Folder,
  Heart,
  ListChecks,
  Pause,
  Play,
  Repeat,
  Settings,
  SkipForward,
  Timer,
  Upload,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react-native';

import { getIconMetadata, type IconName } from './icon-names';

const iconRegistry: Record<IconName, LucideIcon> = {
  activity: Activity,
  'bar-chart-3': BarChart3,
  check: Check,
  'check-circle-2': CheckCircle2,
  circle: Circle,
  clock: Clock,
  folder: Folder,
  heart: Heart,
  'list-checks': ListChecks,
  pause: Pause,
  play: Play,
  repeat: Repeat,
  settings: Settings,
  'skip-forward': SkipForward,
  timer: Timer,
  upload: Upload,
};

export interface AppIconProps extends Omit<LucideProps, 'name'> {
  name: IconName;
  accessibilityLabel?: string;
}

/** Renders a curated data name without leaking icon components into domain data. */
export function AppIcon({ name, accessibilityLabel, ...props }: AppIconProps) {
  const Icon = iconRegistry[name];
  const label = accessibilityLabel ?? getIconMetadata(name).label;

  return <Icon {...props} role="img" accessibilityLabel={label} aria-label={label} />;
}
