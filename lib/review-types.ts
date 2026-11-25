export type PublicReview = {
  id: string;
  author: string;
  rating: number;
  body: string;
  verified: boolean;
  createdAt: string;
};

export const reviewLimits = {
  authorMin: 2,
  authorMax: 60,
  bodyMin: 10,
  bodyMax: 1000,
} as const;
