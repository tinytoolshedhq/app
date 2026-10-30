import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import PreviewScreen from '../screens/PreviewScreen';
import PlayerScreen from '../screens/PlayerScreen';
import PaywallScreen from '../screens/PaywallScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { colors } from '../theme/colors';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.cell,
    text: colors.label,
    border: colors.sep,
    primary: colors.brand,
  },
};

export default function AppNavigator() {
  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Preview" component={PreviewScreen} />
        <Stack.Screen name="Player" component={PlayerScreen} />
        <Stack.Screen name="Paywall" component={PaywallScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
