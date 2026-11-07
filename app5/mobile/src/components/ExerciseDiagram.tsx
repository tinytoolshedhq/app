import Svg, {
  Circle,
  Ellipse,
  G,
  Line,
  Path,
  Polyline,
  Rect,
} from "react-native-svg";
import type { Exercise } from "../content";

type Point = [number, number];
export default function ExerciseDiagram({
  exercise,
  pose: requested,
  size = 180,
  background = "#F5F8FE",
}: {
  exercise?: Exercise;
  pose?: string;
  size?: number;
  background?: string;
}) {
  const pose = exercise?.library?.pose ?? requested ?? "raise";
  const sitting = exercise?.position === "sitting";
  const lying =
    exercise?.position === "lying" ||
    [
      "hug",
      "glute",
      "hamstring",
      "roll",
      "pelvis",
      "heel",
      "floor-arms",
    ].includes(pose);
  const skin = "#DBAF91",
    shirt = "#3F80EA",
    pants = "#25334B";
  const line = (
    a: Point,
    b: Point,
    color: string,
    width = 12,
    key?: string,
  ) => (
    <Line
      key={key}
      x1={a[0]}
      y1={a[1]}
      x2={b[0]}
      y2={b[1]}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
    />
  );
  let head: Point = [110, 58],
    shoulders: Point = [110, 87],
    hip: Point = [110, 139];
  let left: Point[] = [
      [96, 87],
      [83, 113],
      [80, 136],
    ],
    right: Point[] = [
      [124, 87],
      [137, 113],
      [140, 136],
    ];
  let legs: Point[][] = sitting
    ? [
        [
          [105, 139],
          [143, 143],
          [146, 181],
        ],
        [
          [115, 139],
          [166, 146],
          [169, 183],
        ],
      ]
    : [
        [
          [104, 139],
          [96, 169],
          [91, 198],
        ],
        [
          [116, 139],
          [125, 170],
          [132, 198],
        ],
      ];
  let arrow = "M 55 111 Q 39 87 65 74",
    tip = "56,74 65,74 63,83";
  if (pose === "chest" || pose === "floor-arms") {
    left = [
      [96, 87],
      [67, 104],
      [45, 97],
    ];
    right = [
      [124, 87],
      [153, 104],
      [176, 97],
    ];
    arrow = "M 71 78 Q 110 45 150 78";
    tip = "141,77 150,78 147,69";
  }
  if (pose === "raise" || pose === "overhead-side") {
    left = [
      [96, 87],
      [82, 59],
      [82, 28],
    ];
    right = [
      [124, 87],
      [138, 59],
      [138, 28],
    ];
    arrow = "M 158 71 L 158 28";
    tip = "152,35 158,28 164,35";
  }
  if (pose === "triceps") {
    left = [
      [96, 87],
      [91, 28],
      [113, 65],
    ];
    right = [
      [124, 87],
      [143, 45],
      [94, 31],
    ];
    arrow = "M 65 28 L 80 28";
    tip = "73,23 80,28 73,33";
  }
  if (pose === "side" || pose === "overhead-side") {
    head = [96, 58];
    shoulders = [101, 87];
    left = [
      [89, 87],
      [75, 113],
      [70, 143],
    ];
    right =
      pose === "side"
        ? [
            [115, 87],
            [132, 114],
            [134, 139],
          ]
        : [
            [115, 87],
            [119, 51],
            [93, 25],
          ];
    arrow = "M 78 37 Q 49 62 55 90";
    tip = "49,82 55,90 61,82";
  }
  if (pose === "neck" || pose === "neck-side") {
    head = pose === "neck-side" ? [102, 60] : [110, 58];
    arrow = "M 88 42 Q 108 25 133 43";
    tip = "126,35 133,43 123,45";
  }
  if (pose === "elbow") {
    left = [
      [96, 87],
      [80, 117],
      [92, 91],
    ];
    right = [
      [124, 87],
      [141, 117],
      [128, 91],
    ];
    arrow = "M 57 126 Q 47 102 66 86";
    tip = "57,88 66,86 65,95";
  }
  if (pose === "hands" || pose === "wrist") {
    left = [
      [96, 87],
      [80, 117],
      [58, 111],
    ];
    right = [
      [124, 87],
      [141, 117],
      [164, 111],
    ];
    arrow = "M 168 94 Q 187 111 170 127";
    tip = "170,118 170,127 179,124";
  }
  if (pose === "knee" || pose === "ankle" || pose === "ankle-circle") {
    legs = [
      [
        [105, 139],
        [149, 143],
        [180, 147],
      ],
      [
        [115, 139],
        [131, 164],
        [134, 191],
      ],
    ];
    arrow = "M 173 175 Q 194 169 193 145";
    tip = "188,153 193,145 198,153";
  }
  if (pose === "twist") {
    left = [
      [96, 87],
      [79, 112],
      [126, 93],
    ];
    right = [
      [124, 87],
      [139, 112],
      [95, 93],
    ];
    arrow = "M 66 126 Q 110 151 155 126";
    tip = "146,126 155,126 153,135";
  }
  if (pose === "blades" || pose === "shoulder") {
    arrow = "M 75 82 C 55 60 51 108 76 104";
    tip = "68,100 76,104 69,111";
  }
  if (pose === "calf") {
    head = [122, 58];
    shoulders = [120, 87];
    hip = [106, 137];
    left = [
      [108, 87],
      [146, 100],
      [171, 92],
    ];
    right = [
      [130, 87],
      [155, 91],
      [174, 78],
    ];
    legs = [
      [
        [106, 137],
        [132, 157],
        [138, 196],
      ],
      [
        [106, 137],
        [79, 168],
        [58, 196],
      ],
    ];
    arrow = "M 75 177 L 71 195";
    tip = "67,187 71,195 78,190";
  }
  if (lying) {
    head = [42, 153];
    shoulders = [66, 159];
    hip = [126, 160];
    left = [
      [69, 155],
      [94, 143],
      [130, 132],
    ];
    right = [
      [69, 164],
      [96, 167],
      [126, 159],
    ];
    legs = [
      [
        [126, 160],
        [155, 124],
        [180, 170],
      ],
      [
        [126, 160],
        [161, 154],
        [193, 170],
      ],
    ];
    arrow = "M 170 108 Q 142 95 119 119";
    tip = "121,109 119,119 129,117";
    if (pose === "hug" || pose === "glute") {
      legs = [
        [
          [126, 160],
          [116, 117],
          [153, 139],
        ],
        [
          [126, 160],
          [165, 135],
          [190, 172],
        ],
      ];
      left = [
        [69, 155],
        [93, 127],
        [116, 119],
      ];
      right = [
        [69, 164],
        [96, 143],
        [119, 125],
      ];
    }
    if (pose === "hamstring") {
      legs = [
        [
          [126, 160],
          [145, 119],
          [152, 69],
        ],
        [
          [126, 160],
          [165, 134],
          [190, 172],
        ],
      ];
      left = [
        [69, 155],
        [103, 122],
        [142, 119],
      ];
      right = [
        [69, 164],
        [108, 135],
        [143, 123],
      ];
      arrow = "M 175 119 L 175 76";
      tip = "169,84 175,76 181,84";
    }
    if (pose === "pelvis" || pose === "roll") {
      arrow = "M 106 119 Q 135 104 151 123";
      tip = "143,119 151,123 143,128";
    }
    if (pose === "heel") {
      legs = [
        [
          [126, 160],
          [160, 159],
          [195, 164],
        ],
        [
          [126, 160],
          [155, 126],
          [180, 173],
        ],
      ];
      arrow = "M 185 188 L 150 188";
      tip = "158,182 150,188 158,194";
    }
    if (pose === "floor-arms") {
      left = [
        [69, 155],
        [92, 131],
        [118, 107],
      ];
      right = [
        [69, 164],
        [96, 186],
        [125, 198],
      ];
      arrow = "M 135 174 Q 156 147 137 117";
      tip = "137,126 137,117 146,121";
    }
    if (pose === "hands" || pose === "wrist" || pose === "elbow") {
      left = [
        [69, 155],
        [96, 154],
        [98, 115],
      ];
      right = [
        [69, 164],
        [105, 163],
        [108, 121],
      ];
      arrow = "M 123 110 Q 142 125 124 142";
      tip = "125,133 124,142 133,139";
    }
    if (pose === "ankle" || pose === "ankle-circle") {
      legs = [
        [
          [126, 160],
          [161, 162],
          [194, 165],
        ],
        [
          [126, 160],
          [158, 173],
          [192, 178],
        ],
      ];
      arrow = "M 194 132 Q 218 148 203 168";
      tip = "203,159 203,168 212,163";
    }
  }
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 220 220"
      accessibilityLabel={
        exercise
          ? `${exercise.name}靜態示意圖與方向箭頭，請配合文字步驟`
          : "伸展示意圖"
      }
    >
      <Rect x="0" y="0" width="220" height="220" fill={background} />
      <Ellipse
        cx="112"
        cy={lying ? "187" : "205"}
        rx="78"
        ry="5"
        fill="#DCE6F7"
      />
      {sitting && !lying && (
        <G stroke="#91A5C5" strokeWidth="5" strokeLinecap="round">
          <Path d="M 88 106 L 89 151 L 161 151" fill="none" />
          <Path d="M 95 152 L 91 191 M 156 152 L 162 194" />
        </G>
      )}
      {lying && (
        <Rect x="22" y="182" width="178" height="4" rx="2" fill="#B4C8E5" />
      )}
      {pose === "calf" && (
        <Line
          x1="181"
          y1="55"
          x2="181"
          y2="200"
          stroke="#91A5C5"
          strokeWidth="5"
        />
      )}
      {legs.map((leg, i) => (
        <G key={i}>
          {line(leg[0], leg[1], pants, 14)}
          {line(leg[1], leg[2], pants, 12)}
          {line(leg[2], [leg[2][0] + 9, leg[2][1]], "#91A5C5", 8)}
        </G>
      ))}
      {line(shoulders, hip, shirt, 29)}
      {[left, right].map((arm, i) => (
        <G key={i}>
          {line(arm[0], arm[1], shirt, 12)}
          {line(arm[1], arm[2], skin, 10)}
          <Circle cx={arm[2][0]} cy={arm[2][1]} r="5" fill={skin} />
        </G>
      ))}
      {line(head, shoulders, skin, 10)}
      <Circle cx={head[0]} cy={head[1]} r="15" fill={skin} />
      <Path
        d={`M ${head[0] - 15} ${head[1] + 1} Q ${head[0] - 22} ${head[1] - 24} ${head[0] + 6} ${head[1] - 18} Q ${head[0] + 20} ${head[1] - 15} ${head[0] + 15} ${head[1] - 1} Q ${head[0] + 7} ${head[1] - 11} ${head[0] - 15} ${head[1] + 1}`}
        fill="#25334B"
      />
      <Path
        d={arrow}
        fill="none"
        stroke="#3F80EA"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="4 3"
      />
      <Polyline
        points={tip}
        fill="none"
        stroke="#3F80EA"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
