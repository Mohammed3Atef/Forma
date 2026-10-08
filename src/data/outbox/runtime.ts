/**
 * The outbox as the account runtime starts it: the queue plus its operation
 * handlers (messages, check-ins, progress photos). Loaded on demand for a
 * signed-in account (B1.13 / AR-02).
 */
import './handlers'; // registers the outbox operation types
export { startOutbox, stopOutbox } from './outbox';
