import { Module } from '@nestjs/common';
import { BarcodeController } from './barcode.controller';
import { FoodsController } from './foods.controller';
import { FoodsService } from './foods.service';
import { OpenFoodFactsBarcodeProvider } from './providers/open-food-facts-barcode.provider';

@Module({
  controllers: [FoodsController, BarcodeController],
  providers: [FoodsService, OpenFoodFactsBarcodeProvider],
  exports: [FoodsService],
})
export class FoodsModule {}
