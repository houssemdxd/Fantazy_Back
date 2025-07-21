import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema()
export class PlayerStat extends Document {
  @Prop({ type: Number, required: true })
  player_id: number;

  @Prop({ type: Types.ObjectId, ref: 'Round', required: true })
  round_id: Types.ObjectId;

  @Prop({ type: Number, default: 0 })
  score: number;
}

export const PlayerStatSchema = SchemaFactory.createForClass(PlayerStat);
