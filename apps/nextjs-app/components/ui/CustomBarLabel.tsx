import React from "react";

interface CustomBarLabelProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: string | number | boolean | null | undefined;
  fill?: string;
  fontSize?: number;
  offset?: number;
  containerWidth?: number;
  alwaysOutside?: boolean;
}

interface CustomValueLabelProps extends CustomBarLabelProps {
  isMax?: boolean;
}

// Minimum width for label to fit inside the bar
const MIN_WIDTH_FOR_INSIDE = 40;
const PADDING = 8;

export const CustomBarLabel: React.FC<CustomBarLabelProps> = ({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  value,
  fill = "#d6e3ff",
  fontSize = 12,
  offset = PADDING,
  containerWidth,
  alwaysOutside = false,
}) => {
  if (value === null || value === undefined || value === false) return null;
  let displayValue = String(value);
  const fixedMargin = 10;
  let estLabelWidth = displayValue.length * (fontSize * 0.6);
  // Mobile: only show percent
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const checkMobile = () =>
      setIsMobile(window.matchMedia("(max-width: 600px)").matches);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  if (isMobile) {
    // Extract percent from label (assumes ' - 35.9%' or ' — 35.9%')
    const percentMatch = displayValue.match(/([\d.]+%)$/);
    displayValue = percentMatch ? percentMatch[1] : displayValue;
    estLabelWidth = displayValue.length * (fontSize * 0.6);
  }
  const fitsInside = estLabelWidth <= width - 2 * offset;
  const labelX = fitsInside && width >= 20 ? fixedMargin : x + width + offset;
  const textAnchor = "start";
  const labelFill = fitsInside && width >= 20 ? "#fff" : fill;

  return (
    <text
      x={labelX}
      y={y + height / 2}
      fill={labelFill}
      fontSize={fontSize}
      dominantBaseline="middle"
      textAnchor={textAnchor}
      style={{ pointerEvents: "none", fontWeight: 500 }}
    >
      {displayValue}
    </text>
  );
};

export const CustomValueLabel: React.FC<CustomValueLabelProps> = ({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  value,
  fill = "#d6e3ff",
  fontSize = 12,
  isMax = false,
  offset = PADDING,
  containerWidth,
}) => {
  const extraOffset = 8;
  const rightMargin = 8;
  if (width < 0) return null;
  let labelX = x + width + offset + extraOffset;
  if (containerWidth) {
    labelX = Math.min(labelX, containerWidth - rightMargin);
  }
  const textAnchor = "start";
  return (
    <text
      x={labelX}
      y={y + height / 2}
      fill={fill}
      fontSize={fontSize}
      dominantBaseline="middle"
      textAnchor={textAnchor}
      style={{ pointerEvents: "none", fontWeight: 700 }}
    >
      {value}
    </text>
  );
};

export default CustomBarLabel;
