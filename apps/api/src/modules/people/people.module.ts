/** Personnel resolution and directory API surface. */
import { Module } from '@nestjs/common';
import { PersonHelper } from './person.helper.js';
import { PersonsController } from './persons.controller.js';

@Module({
  controllers: [PersonsController],
  providers: [PersonHelper],
  exports: [PersonHelper],
})
export class PeopleModule {}
