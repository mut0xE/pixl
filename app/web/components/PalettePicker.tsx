"use client";
import { u32ToHex } from "../../../packages/sdk";

// Palette swatches from on-chain `season.palette`; selecting sets the paint color.
export function PalettePicker({
  palette,
  selected,
  onSelect,
  disabled,
}: {
  palette: number[];
  selected: number;
  onSelect: (index: number) => void;
  disabled?: boolean;
}) {
  const density =
    palette.length >= 18 ? "crowded" : palette.length >= 12 ? "dense" : "base";

  return (
    <div
      className="palette"
      data-density={density}
      role="radiogroup"
      aria-label="Palette"
    >
      {palette.map((color, i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={i === selected}
          aria-label={`Color ${i}`}
          title={`#${i}`}
          className={
            "palette__swatch" + (i === selected ? " palette__swatch--on" : "")
          }
          style={{ background: u32ToHex(color) }}
          disabled={disabled}
          onClick={() => onSelect(i)}
        />
      ))}
    </div>
  );
}
