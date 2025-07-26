// round-scheduler.module.ts
import { Module } from '@nestjs/common';
import { RoundSchedulerService } from './round-scheduler.service';
import { FixtureModule } from '../fixture/fixture.module'; // adjust path
import { RoundService } from 'src/round/round.service';
import { RoundModule } from 'src/round/round.module';
import { FantasyTeamModule } from 'src/fantasy-team/fantasy-team.module';
import { AuthModule } from 'src/auth/auth.module';
import { PlayerStatsModule } from 'src/player-stats/player-stats.module';

@Module({
  imports: [FixtureModule,RoundModule,FantasyTeamModule,AuthModule,PlayerStatsModule], // ✅ import module that exports FixtureService
  providers: [RoundSchedulerService],
  exports: [RoundSchedulerService], // optional, if used elsewhere
})
export class RoundSchedulerModule {}
