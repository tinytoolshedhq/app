import { StyleSheet } from "react-native";

export const palette = {
  bg: "#FFFFFF",
  ink: "#141D2F",
  muted: "#738096",
  blue: "#3F81EA",
  card: "#FFFFFF",
  border: "#E8EDF4",
  wash: "#F5F8FE",
  pale: "#EAF2FF",
};
export const font = {
  regular: "NotoSansTC_400Regular",
  medium: "NotoSansTC_500Medium",
  bold: "NotoSansTC_700Bold",
};
export const ui = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  content: { paddingHorizontal: 24, paddingBottom: 24 },
  heading: {
    color: palette.ink,
    fontSize: 32,
    lineHeight: 46,
    fontFamily: font.bold,
  },
  subtitle: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: font.regular,
    marginTop: 4,
  },
  section: {
    color: palette.ink,
    fontSize: 20,
    lineHeight: 30,
    fontFamily: font.bold,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  link: { color: palette.blue, fontSize: 14, fontFamily: font.medium },
  small: {
    fontSize: 12,
    color: palette.muted,
    lineHeight: 19,
    fontFamily: font.regular,
  },
  number: { fontVariant: ["tabular-nums"], fontFamily: font.bold },
  button: {
    backgroundColor: palette.blue,
    borderRadius: 14,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: font.bold,
    textAlign: "center",
  },
});
