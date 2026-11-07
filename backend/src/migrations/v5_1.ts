/** Backfill missing FIFO inventory values without rewriting existing posted balances. Run once after DB backup. */
import 'dotenv/config';
import mongoose from 'mongoose';
import {config, validateConfig} from '../config.js';
import {UsdtTransaction} from '../models.js';
import {D} from '../lib/finance.js';
validateConfig();
await mongoose.connect(config.mongoUri,{serverSelectionTimeoutMS:10000});
let updated=0;
try{
 const buys=await UsdtTransaction.collection.find({side:'buy',remainingQuantity:{$exists:false},status:'posted'}).toArray();
 for(const buy of buys){
    const sells=await UsdtTransaction.collection.find({side:'sell',status:'posted','allocations.buyTradeId':buy._id}).toArray();
    let used=D(0);
    for(const sell of sells){for(const allocation of (sell.allocations||[])) if(String(allocation.buyTradeId)===String(buy._id)) used=used.plus(D(allocation.quantity.toString()));}
    const original=D(buy.quantity?.toString()||0);
    const remaining=original.minus(used);
    if(remaining.lt(0))throw new Error(`Invalid historical USDT inventory for buy ${buy._id}: allocations exceed purchase`);
    const result=await UsdtTransaction.collection.updateOne({_id:buy._id,remainingQuantity:{$exists:false}},{$set:{remainingQuantity:mongoose.Types.Decimal128.fromString(remaining.toFixed(8))}});
    updated+=result.modifiedCount;
 }
 console.log(`v5.1 migration: restored ${updated} legacy buy inventory values. No existing balances were overwritten.`);
}finally{await mongoose.disconnect();}
