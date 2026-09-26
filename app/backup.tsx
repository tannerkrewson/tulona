import { Redirect, type Href } from 'expo-router';

export default function BackupRoute() {
  return <Redirect href={'/settings/data' as Href} />;
}
