// Layer 2 of the reminder pipeline: obtaining this device's Expo push token
// so the backend can reach it even when the app isn't open. Registered on
// login via POST /push/register, unregistered via DELETE /push/register on
// logout (see API_CONTRACT.md).
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { PushPlatform } from '../api/types';

export function currentPlatform(): PushPlatform {
  return Platform.OS === 'ios' ? 'IOS' : 'ANDROID';
}

/** Returns an Expo push token for this device, or null if unavailable (e.g. simulator). */
export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const response = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return response.data;
  } catch {
    return null;
  }
}
