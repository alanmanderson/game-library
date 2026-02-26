import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as ScreenOrientation from "expo-screen-orientation";
import { useAuth } from "../auth/AuthContext";
import { RegisterScreen } from "../auth/RegisterScreen";
import { LobbyScreen } from "../lobby/LobbyScreen";
import { RoomScreen } from "../room/RoomScreen";

export type RootStackParamList = {
  Register: undefined;
  Lobby: undefined;
  Room: { roomCode: string };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Stack = createNativeStackNavigator<RootStackParamList>() as any;

export function AppNavigator() {
  const { user, loading } = useAuth();

  // Lock portrait on app startup (GameScreen overrides to landscape when mounted)
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#1a3a1a" }}>
        <ActivityIndicator size="large" color="#4a90d9" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#1a3a1a" },
        }}
      >
        {user ? (
          <>
            <Stack.Screen name="Lobby" component={LobbyScreen} />
            <Stack.Screen name="Room" component={RoomScreen} />
          </>
        ) : (
          <Stack.Screen name="Register" component={RegisterScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
