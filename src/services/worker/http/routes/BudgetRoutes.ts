/**
 * Budget Routes
 *
 * Exposes budget tracking status, configuration, and history via HTTP API.
 */

import express, { Request, Response } from 'express';
import { BaseRouteHandler } from '../BaseRouteHandler.js';
import type { BudgetController } from '../../budget/BudgetController.js';

export class BudgetRoutes extends BaseRouteHandler {
  constructor(
    private budgetController: BudgetController
  ) {
    super();
  }

  setupRoutes(app: express.Application): void {
    app.get('/api/budget/status', this.handleGetStatus.bind(this));
    app.get('/api/budget/config', this.handleGetConfig.bind(this));
    app.get('/api/budget/history', this.handleGetHistory.bind(this));
  }

  private handleGetStatus = this.wrapHandler((req: Request, res: Response): void => {
    res.json(this.budgetController.getStatus());
  });

  private handleGetConfig = this.wrapHandler((req: Request, res: Response): void => {
    res.json(this.budgetController.getConfig());
  });

  private handleGetHistory = this.wrapHandler((req: Request, res: Response): void => {
    const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const limit = rawLimit !== undefined && !isNaN(rawLimit) && rawLimit >= 0 ? rawLimit : undefined;
    const rawOffset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
    const offset = rawOffset !== undefined && !isNaN(rawOffset) && rawOffset >= 0 ? rawOffset : undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;

    // Validate date format (YYYY-MM-DD)
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const validDateFrom = dateFrom && datePattern.test(dateFrom) ? dateFrom : undefined;
    const validDateTo = dateTo && datePattern.test(dateTo) ? dateTo : undefined;

    res.json(this.budgetController.getHistory({ limit, offset, dateFrom: validDateFrom, dateTo: validDateTo }));
  });
}
