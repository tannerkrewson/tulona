import { LogBox } from 'react-native';

// Gesture Handler reads React Native's deprecated DrawerLayoutAndroid export when it loads,
// so this must be imported before react-native-gesture-handler.
LogBox.ignoreLogs(['DrawerLayoutAndroid is deprecated']);
