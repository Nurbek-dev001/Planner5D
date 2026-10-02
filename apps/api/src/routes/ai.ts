import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { RecognizedPlan } from '@spaceplan/shared';
import { requireAuth } from '../auth';
import { config } from '../config';
import { HttpError, parse } from '../http';

export const aiRouter = Router();

const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: process.env.NODE_ENV === 'test' ? 10_000 : 30, standardHeaders: 'draft-8', legacyHeaders: false });

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

aiRouter.get('/status', (_req, res) => {
  res.json({ planRecognition: config.aiEnabled });
});

const RecognizeBody = z.object({
  /** base64 without the data: prefix; the client downscales to ≤ 1568 px */
  image: z.string().min(100).max(7_000_000),
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  width: z.number().int().min(50).max(4000),
  height: z.number().int().min(50).max(4000),
});

/** What the model returns (constrained by structured outputs) */
const PlanOutput = z.object({
  is_floor_plan: z.boolean(),
  walls: z.array(z.object({ x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(), thickness: z.number() })),
  openings: z.array(z.object({ kind: z.enum(['door', 'window']), x: z.number(), y: z.number(), width: z.number() })),
  rooms: z.array(z.object({ name: z.string(), x: z.number(), y: z.number() })),
  scale: z.object({ known: z.boolean(), cm_per_pixel: z.number() }),
});

const SYSTEM = `You convert architectural floor plan images into precise vector geometry for an interior design editor.
Work in the pixel coordinates of the image as given (origin top-left, x to the right, y down).

Walls: trace every wall (exterior and interior partitions) as straight centre-line segments with their drawn thickness in pixels. Draw each wall as ONE continuous segment through door and window openings, and extend segments to meet exactly at corners and T-junctions. Ignore furniture, dimension lines, hatching, text and the plan frame.
Openings: report each door and window by the centre point of the opening on its wall and its width in pixels.
Rooms: report each room's label as written on the plan (keep the original language, without area numbers) with a point inside that room.
Scale: if dimension annotations or room areas allow it, compute centimetres per pixel from them and set known=true; otherwise known=false and cm_per_pixel=0.
If the image is not a floor plan, set is_floor_plan=false and return empty lists.`;

aiRouter.post('/recognize-plan', requireAuth, limiter, async (req, res, next) => {
  try {
    if (!config.aiEnabled) throw new HttpError(503, 'AI is not configured on this server');
    const body = parse(RecognizeBody, req.body);
    const response = await anthropic().beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // Geometry accuracy matters more than latency here
      output_config: { effort: 'high', format: betaZodOutputFormat(PlanOutput) },
      // If a safety classifier declines, retry on Anthropic's recommended fallback model
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: body.mediaType, data: body.image } },
            { type: 'text', text: `Image size: ${body.width} × ${body.height} px. Extract the floor plan.` },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') throw new HttpError(422, 'The model declined to process this image');
    const out = response.parsed_output;
    if (!out) throw new HttpError(502, 'Could not read the recognition result');
    if (!out.is_floor_plan || !out.walls.length) throw new HttpError(422, 'No floor plan found in the image');

    const inImage = (v: number, max: number) => Math.min(max, Math.max(0, v));
    const plan: RecognizedPlan = {
      source: 'ai',
      imageWidth: body.width,
      imageHeight: body.height,
      walls: out.walls
        .filter((w) => [w.x1, w.y1, w.x2, w.y2, w.thickness].every(Number.isFinite))
        .map((w) => ({
          x1: inImage(w.x1, body.width),
          y1: inImage(w.y1, body.height),
          x2: inImage(w.x2, body.width),
          y2: inImage(w.y2, body.height),
          thickness: Math.max(1, w.thickness),
        })),
      openings: out.openings.filter((o) => o.width > 0),
      rooms: out.rooms.map((r) => ({ ...r, name: r.name.slice(0, 60) })),
      cmPerPixel: out.scale.known && out.scale.cm_per_pixel > 0 ? out.scale.cm_per_pixel : null,
    };
    res.json({ plan });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return next(new HttpError(429, 'AI is busy, try again in a minute'));
    if (e instanceof Anthropic.APIError) {
      console.error('Anthropic API error', e.status, e.message);
      return next(new HttpError(502, 'AI service error'));
    }
    next(e);
  }
});
