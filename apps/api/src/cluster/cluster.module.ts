import { Global, Module } from '@nestjs/common';
import { ClusterService } from './cluster.service';

/**
 * Coordination between API instances (ATT-1163): heartbeats, a message bus, reader presence, reader screen claims
 * and cluster-wide deadlines, all in Valkey. Without `VALKEY_URL` they stay in the process.
 */
@Global()
@Module({
  providers: [ClusterService],
  exports: [ClusterService],
})
export class ClusterModule {}
