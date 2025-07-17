import { Module } from '@nestjs/common';
import { FantasyTeamService } from './fantasy-team.service';
import { FantasyTeamController } from './fantasy-team.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { FantasyTeamSchema } from './entities/fantasy-team.entity';

@Module({


   imports: [
    MongooseModule.forFeature([{ name: 'FantasyTeam', schema: FantasyTeamSchema }]),
  ],
  controllers: [FantasyTeamController],
  providers: [FantasyTeamService]
})
export class FantasyTeamModule {}
