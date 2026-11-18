import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlacementTicket } from './entities/placement-ticket.entity';
import { TicketWorkflow } from './ticket-workflow.service';
import { TicketsService } from './tickets.service';
import { TicketReadService } from './ticket-read.service';
import { TicketsController } from './tickets.controller';
import { TicketSearchService } from './ticket-search.service';
import { SearchController } from './search.controller';

/** Placement core. Global so feature modules (rfq, threads, quotes, qcr, ...) can use TicketWorkflow. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PlacementTicket])],
  providers: [TicketWorkflow, TicketsService, TicketReadService, TicketSearchService],
  controllers: [TicketsController, SearchController],
  exports: [TicketWorkflow, TicketsService, TicketReadService],
})
export class TicketsModule {}
