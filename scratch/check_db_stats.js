const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const PhoneNumber = mongoose.model('PhoneNumber', new mongoose.Schema({ 
        surveyId: mongoose.Schema.Types.ObjectId, 
        number: String, 
        status: String 
    }));
    
    const count = await PhoneNumber.countDocuments({});
    const stats = await PhoneNumber.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    console.log('Total Count:', count);
    console.log('Status breakdown:', stats);
    
    const latest = await PhoneNumber.find({}).sort({ _id: -1 }).limit(1).lean();
    console.log('Latest record:', latest);
    
    process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
