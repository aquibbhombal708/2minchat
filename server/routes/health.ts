import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    app: '2MinChat',
    uptime: Math.floor(process.uptime()),
    timestamp: Date.now(),
  });
});

export default router;
