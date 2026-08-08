import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 20% 20%, rgba(122,162,255,0.22), transparent 30%), linear-gradient(180deg, #070a11 0%, #0b1018 52%, #06080d 100%)",
          color: "#f6efe4",
          fontSize: 176,
          fontWeight: 700,
          letterSpacing: "-0.04em",
        }}
      >
        <div
          style={{
            width: 360,
            height: 360,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 80,
            border: "16px solid rgba(255,255,255,0.08)",
            background: "rgba(18,23,35,0.96)",
            boxShadow: "0 0 0 12px rgba(122,162,255,0.12) inset",
          }}
        >
          Pixl
        </div>
      </div>
    ),
    size
  );
}
