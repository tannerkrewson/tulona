import {
  Activity,
  AlarmClock,
  Archive,
  Award,
  BarChart3,
  BookOpen,
  Brain,
  Briefcase,
  CalendarDays,
  Camera,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleDot,
  Clock,
  Coffee,
  Dumbbell,
  Flame,
  Folder,
  Gamepad2,
  GraduationCap,
  Headphones,
  Heart,
  House,
  Inbox,
  Laptop,
  Leaf,
  Lightbulb,
  ListChecks,
  Medal,
  MessageCircle,
  Moon,
  Music,
  Palette,
  Pause,
  Pencil,
  Phone,
  Plane,
  Play,
  Repeat,
  Settings,
  ShoppingBag,
  ShowerHead,
  SkipForward,
  Smile,
  Sparkles,
  Sun,
  Timer,
  Trash2,
  Utensils,
  Upload,
  Wallet,
  Watch,
  Zap,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react-native';
import { Text } from 'react-native';

import { getIconMetadata, isEmoji, isIconName, type IconName, type IconValue } from './icon-names';

export const iconRegistry: Readonly<Record<IconName, LucideIcon>> = {
  activity: Activity,
  'alarm-clock': AlarmClock,
  archive: Archive,
  award: Award,
  'bar-chart-3': BarChart3,
  'book-open': BookOpen,
  brain: Brain,
  briefcase: Briefcase,
  'calendar-days': CalendarDays,
  camera: Camera,
  car: Car,
  check: Check,
  'check-circle-2': CheckCircle2,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  circle: Circle,
  'circle-dot': CircleDot,
  clock: Clock,
  coffee: Coffee,
  dumbbell: Dumbbell,
  flame: Flame,
  folder: Folder,
  'gamepad-2': Gamepad2,
  'graduation-cap': GraduationCap,
  headphones: Headphones,
  heart: Heart,
  house: House,
  inbox: Inbox,
  laptop: Laptop,
  leaf: Leaf,
  lightbulb: Lightbulb,
  'list-checks': ListChecks,
  medal: Medal,
  'message-circle': MessageCircle,
  moon: Moon,
  music: Music,
  palette: Palette,
  pause: Pause,
  pencil: Pencil,
  phone: Phone,
  plane: Plane,
  play: Play,
  repeat: Repeat,
  settings: Settings,
  'shopping-bag': ShoppingBag,
  'shower-head': ShowerHead,
  'skip-forward': SkipForward,
  smile: Smile,
  sparkles: Sparkles,
  sun: Sun,
  timer: Timer,
  'trash-2': Trash2,
  utensils: Utensils,
  upload: Upload,
  wallet: Wallet,
  watch: Watch,
  zap: Zap,
};

export interface AppIconProps extends Omit<LucideProps, 'name'> {
  name: IconValue;
  accessibilityLabel?: string;
}

/** Renders a curated data name without leaking icon components into domain data. */
export function AppIcon({ name, accessibilityLabel, ...props }: AppIconProps) {
  if (isEmoji(name)) {
    const size = typeof props.size === 'number' ? props.size : 24;
    return (
      <Text
        accessibilityLabel={accessibilityLabel ?? `${name} emoji`}
        accessibilityRole="image"
        style={{
          color: props.color,
          fontSize: size,
          lineHeight: size * 1.2,
          textAlign: 'center',
        }}
      >
        {name}
      </Text>
    );
  }

  const iconName = isIconName(name) ? name : 'activity';
  const Icon = iconRegistry[iconName];
  const label = accessibilityLabel ?? getIconMetadata(iconName).label;

  return <Icon {...props} role="img" accessibilityLabel={label} aria-label={label} />;
}
