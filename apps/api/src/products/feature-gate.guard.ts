import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProductsService } from './products.service';
import { ProductCode } from './dto/products.dto';

export const REQUIRED_PRODUCT_KEY = 'required_product';

/**
 * Decorator to mark a route as requiring a specific product license
 *
 * Usage:
 * @RequireProduct(ProductCode.CLINIQ_BRIEF)
 * @UseGuards(SupabaseGuard, FeatureGateGuard)
 * @Get('some-endpoint')
 * async someEndpoint() { ... }
 */
export const RequireProduct = (productCode: ProductCode) =>
  SetMetadata(REQUIRED_PRODUCT_KEY, productCode);

/**
 * Guard that checks if the current user has access to a required product
 *
 * This guard should be used AFTER SupabaseGuard to ensure we have
 * the user and hospital context available.
 *
 * For Doctors: Checks if they have an active license for the product
 * For Hospital Managers: Checks if the hospital has an active subscription
 * For Super Admins: Always allows access
 */
@Injectable()
export class FeatureGateGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private productsService: ProductsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredProduct = this.reflector.getAllAndOverride<ProductCode>(
      REQUIRED_PRODUCT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No product requirement, allow access
    if (!requiredProduct) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const hospitalId = request.hospitalId;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (!hospitalId) {
      throw new ForbiddenException('Hospital context required (x-hospital-id header)');
    }

    // Check if user has access to the product
    const hasAccess = await this.productsService.canAccessProduct(
      hospitalId,
      user.id,
      requiredProduct,
    );

    if (!hasAccess) {
      throw new ForbiddenException({
        code: 'PRODUCT_ACCESS_DENIED',
        message: `Access to ${requiredProduct} is required for this feature`,
        productCode: requiredProduct,
      });
    }

    return true;
  }
}
