import { Controller, Get, Post, Param } from '@nestjs/common';
import { QueueService } from './queue.service';

@Controller('v1/queue/public')
export class QueuePublicController {
  constructor(private readonly queueService: QueueService) {}

  /**
   * Get queue status by token (no auth required)
   * GET /v1/queue/public/status/:token
   */
  @Get('status/:token')
  async getQueueStatus(@Param('token') token: string) {
    return this.queueService.getQueueStatusByToken(token);
  }

  /**
   * Cancel queue entry by token (no auth required)
   * POST /v1/queue/public/cancel/:token
   */
  @Post('cancel/:token')
  async cancelQueue(@Param('token') token: string) {
    return this.queueService.cancelQueueByToken(token);
  }
}
