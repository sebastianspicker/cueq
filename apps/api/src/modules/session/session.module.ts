/** Authenticated self-service session API boundary. */
import { Module } from '@nestjs/common';
import { PeopleModule } from '../people/public.js';
import { MeController } from './me.controller.js';

@Module({
  imports: [PeopleModule],
  controllers: [MeController],
})
export class SessionModule {}
