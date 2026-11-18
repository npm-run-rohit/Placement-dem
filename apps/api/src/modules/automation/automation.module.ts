import { Module } from '@nestjs/common';
import { SlaSweeperHandler } from './sla-sweeper.handler';

/**
 * Automation engine (W8). V1 automations are code + config (SLA master, ladder, thresholds in
 * app_settings). The config-driven rules engine (trigger/condition/action) from the Architecture
 * plan is a later phase - see PLAN.md Phase 4.
 */
@Module({ providers: [SlaSweeperHandler], exports: [SlaSweeperHandler] })
export class AutomationModule {}
