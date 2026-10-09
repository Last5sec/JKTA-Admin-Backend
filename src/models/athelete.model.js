import mongoose from "mongoose";
const Schema = mongoose.Schema;

const atheleteSchema = new Schema(
    {
        regNo: String,
        athleteName: String,
        fatherName: String,
        motherName: String,
        dob: Date,
        gender: String,
        district: String,
        mob: String,
        email: String,
        adharNumber: String,
        address: String,
        pin: String,
        panNumber: String,
        academyName: String,
        coachName: String,
        photo: String,
        certificate: String,
        residentCertificate: String,
        adharFrontPhoto: String,
        adharBackPhoto: String,
        status: {
            enum: ["pending", "approved", "rejected"],
            type: String,
            default: "pending",
        },
        payment: {
            type: Boolean,
            default: false,
        },
        // ---- Licence card delivery tracking (shared with the public backend) ----
        enrollmentNumber: String,
        licenceEmailStatus: {
            type: String,
            enum: ["pending", "sent", "failed"],
        },
        licenceEmailMessageId: String,
        licenceEmailError: String,
        licenceEmailAttempts: {
            type: Number,
            default: 0,
        },
        licenceEmailLastAttemptAt: Date,
        licenceIssuedAt: Date,
        licenceProcessingAt: Date,
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Athlete", atheleteSchema);
