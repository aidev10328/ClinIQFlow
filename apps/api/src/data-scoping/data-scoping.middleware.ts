import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { DataScopingService } from './data-scoping.service';

@Injectable()
export class DataScopingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(DataScopingMiddleware.name);

  constructor(private dataScopingService: DataScopingService) {}

  async use(req: any, res: any, next: Function) {
    // Only resolve if we have both user and hospital context
    if (req.user?.id && req.hospitalId) {
      try {
        req.scopingContext = await this.dataScopingService.resolveContext(
          req.user.id,
          req.hospitalId,
        );
      } catch (e) {
        // Gracefully degrade: set null context, don't block request
        this.logger.debug(`Data scoping context resolution failed for user ${req.user.id}: ${e.message}`);
        req.scopingContext = null;
      }
    }
    next();
  }
}
