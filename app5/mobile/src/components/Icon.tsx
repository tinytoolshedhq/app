import { figmaAssets } from "./figmaAssets";
import Svg, { Ellipse, Path, SvgXml } from "react-native-svg";
import { palette } from "../theme/studio";
export type IconName =
  | "arrow"
  | "back"
  | "close"
  | "pause"
  | "play"
  | "next"
  | "previous"
  | "music"
  | "grip";
export default function Icon({
  name,
  size = 22,
  color = palette.ink,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  if (name === "back")
    return <SvgXml xml={figmaAssets.back} accessible={false} />;
  const paths: Record<Exclude<IconName, "music">, string> = {
    grip: "M8 6h.01M16 6h.01M8 12h.01M16 12h.01M8 18h.01M16 18h.01",
    arrow: "M5 12h14m-6-6 6 6-6 6",
    back: "m14 6-6 6 6 6",
    close: "m6 6 12 12M6 18 18 6",
    pause: "M9 6v12M15 6v12",
    play: "m9 5 10 7-10 7Z",
    next: "m5 6 8 6-8 6Z M17 6v12",
    previous: "m19 6-8 6 8 6Z M7 6v12",
  };
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
    >
      {name === "music" ? (
        <>
          <Path d="M9 18V5l11-2v13M9 8l11-2" />
          <Ellipse cx={6} cy={18} rx={3} ry={2} />
          <Ellipse cx={17} cy={16} rx={3} ry={2} />
        </>
      ) : (
        <Path
          d={paths[name]}
          fill={["play", "next", "previous"].includes(name) ? color : "none"}
        />
      )}
    </Svg>
  );
}
