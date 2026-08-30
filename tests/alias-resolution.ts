import type { DataLayer } from '@data';
import type { DomainLayer } from '@domain';

export interface FoundationAliasResolution {
  data: DataLayer;
  domain: DomainLayer;
}
