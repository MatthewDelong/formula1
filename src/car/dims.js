// Shared key dimensions (metres), loosely based on the 2026 FIA F1
// Technical Regulations (Section C). Values are representative, not a
// replica of any team's car.

export const REF_Y = 0.045; // reference plane (underside of floor, top of plank)
export const PLANK_T = 0.01;

export const FRONT_AXLE_X = 1.7;
export const REAR_AXLE_X = -1.7; // wheelbase 3400 mm (max, C2.3.3)

// 2026: 25 mm narrower front / 30 mm narrower rear, diameter -15 / -10 mm
export const FRONT_WHEEL = { r: 0.3525, w: 0.28, z: 0.8, cy: 0.3525 };
export const REAR_WHEEL = { r: 0.355, w: 0.375, z: 0.7625, cy: 0.355 }; // outer face at 950 mm
export const RIM_R = 0.2286; // 18-inch rims

export const FRONT_DISC_R = 0.1675; // 335 mm (325–345 allowed)
export const REAR_DISC_R = 0.137; // 274 mm (260–280 allowed)
export const DISC_T = 0.032; // max 34 mm

export const FW_HALF_SPAN = 0.8;
export const RW_HALF_SPAN = 0.5;

// Single central tailpipe, 390–400 mm behind the rear axle, above Z = 350 mm
export const EXHAUST_EXIT = { x: REAR_AXLE_X - 0.395, y: 0.455, r: 0.05 };

export const ROLL_HOOP_TOP = REF_Y + 0.968; // structure required at Z = 968 mm
