import { View } from "react-native";
import { SvgXml } from "react-native-svg";
import { figmaAssets } from "./figmaAssets";

/** Approved local Figma artwork; scale uniformly, preserving each SVG’s root geometry. */
export default function Mascot({
  size = 90,
  mood = "hello",
}: {
  size?: number;
  mood?: "hello" | "cheer";
}) {
  const width = mood === "hello" ? 200 : 230;
  const height = mood === "hello" ? 220 : 253;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="藍色壺鈴吉祥物，微笑鼓勵你"
      style={{
        width: size,
        height: (size * height) / width,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        pointerEvents="none"
        style={{ width, height, transform: [{ scale: size / width }] }}
      >
        <SvgXml
          xml={
            mood === "hello"
              ? figmaAssets.kettlebell_hello
              : figmaAssets.kettlebell_cheer
          }
        />
      </View>
    </View>
  );
}
