import { wsConnectionsCount } from '../ws/hub';

export const wsConnectionsCount$ = (): number => wsConnectionsCount();