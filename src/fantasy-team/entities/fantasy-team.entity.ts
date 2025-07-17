// fantasy-team.entity.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema()
export class FantasyTeam extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user_id: Types.ObjectId;

  
  @Prop({ type: Number, ref: 'Player', required: true })
  player_id: number;

  @Prop({ default: false })
  isCaptain: boolean;

  @Prop({ default: false })
  isViceCaptain: boolean;

  @Prop({ default: false })
  isBench: boolean;
}

export const FantasyTeamSchema = SchemaFactory.createForClass(FantasyTeam);
