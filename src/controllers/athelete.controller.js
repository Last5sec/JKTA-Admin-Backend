import { ObjectId } from "mongodb";
import Athelete from "../models/athelete.model.js";
import mongoose from "mongoose";
import { deleteFiles, generateCard } from "../utils/idcard.js";
import AtheleteEnrollment from "../models/athleteEnrollment.model.js";
import { sendWithAttachment } from "./mail.controller.js";
import { downloadImage } from "../utils/downloadImage.js";
import expiryDate from "../utils/expiryDate.js";

const listAtheletes = async (req, res) => {
    try {
        // const atheletes = await Athelete.find({
        //     payment: true,
        // });

        const atheletes = await Athelete.find() // find all atheletes - 5feb 2025 as per request

        // sort the atheletes by status pending, approved, rejected
        atheletes.sort((a, b) => {
            if (a.status === "pending" && b.status !== "pending") return -1;
            if (a.status !== "pending" && b.status === "pending") return 1;
            if (a.status === "approved" && b.status === "rejected") return -1;
            if (a.status === "rejected" && b.status === "approved") return 1;
            return 0;
        });

        res.json(atheletes);
    } catch (error) {
        res.json({ message: error.message });
    }
};

const pendingAtheletes = async (req, res) => {
    try {
        const atheletes = await Athelete.find({
            status: "pending",
            // payment: true,
        });
        res.json(atheletes);
    } catch (error) {
        res.json({ message: error.message });
    }
};

const pendingAtheletesCount = async (req, res) => {
    try {
        const count = await Athelete.countDocuments({
            status: "pending",
            // payment: true,
        });
        res.json({ count });
    } catch (error) {
        res.json({ message: error.message });
    }
};

const allAtheletesCount = async (req, res) => {
    try {
        // const count = await Athelete.countDocuments({
        //     payment: true,
        // });

        const count = await Athelete.countDocuments(); // count all atheletes - 5feb 2025 as per request

        res.json({ count });
    } catch (error) {
        res.json({ message: error.message });
    }
};

const markStatusApproved = async (req, res) => {
    try {
        const regNo = req.params.regNo;

        console.log("RegNo:", regNo);

        // find id from regNo
        const atheleteData = await Athelete.findOne({ regNo });

        if (!atheleteData.photo) {
            return res.status(404).json({
                message:
                    "Photo not found, Without photo, profile can't be approved",
            });
        }

        // check if id is available in AtheleteEnrollment (regNo field)
        const isEnrolled = await AtheleteEnrollment.findOne({
            regNo: atheleteData._id,
        });

        // generate enrollment number
        let AthleteEnrollmentDetails;
        if (isEnrolled) {
            AthleteEnrollmentDetails = isEnrolled;
        } else {
            const AthleteEnrollmentCount =
                await AtheleteEnrollment.countDocuments(); // as it returns a promise
            AthleteEnrollmentDetails = await AtheleteEnrollment.create({
                enrollmentNumber: `JKTA${1000 + AthleteEnrollmentCount + 1}`,
                regNo: atheleteData._id,
            });
        }

        console.log(AthleteEnrollmentDetails);

        const athlete = await Athelete.findOneAndUpdate(
            { regNo },
            { $set: { status: "approved" } },
            { new: true }
        );

        if (!athlete) {
            return res.status(404).json({ message: "Athlete not found" });
        }

        // If the licence card was already generated and emailed (e.g. the
        // public backend now issues it automatically on verified payment),
        // do not send it a second time on approval.
        if (atheleteData.licenceEmailStatus === "sent") {
            return res.status(200).json({
                message: "Athlete approved successfully. Licence card was already delivered.",
                athlete,
                licenceEmailSent: true,
            });
        }

        const validUntil = expiryDate(atheleteData.createdAt);
        let licenceEmailResult = { sent: false, error: null };

        try {
            await downloadImage(
                atheleteData.photo,
                `${atheleteData.regNo}-download.png`
            );

            await generateCard({
                id: atheleteData.regNo,
                enrollmentNo: AthleteEnrollmentDetails.enrollmentNumber,
                type: "A",
                name: atheleteData.athleteName,
                parentage: atheleteData.fatherName,
                gender: atheleteData.gender,
                valid: validUntil,
                district: atheleteData.district,
                dob: `${atheleteData.dob}`,
            });

            licenceEmailResult = await sendWithAttachment(
                atheleteData.email,
                `${AthleteEnrollmentDetails.enrollmentNumber} - Congratulations, your profile has been approved`,
                `Dear ${atheleteData.athleteName},\n\n            Congratulations! Your profile has been approved by JKTA. Below are your enrollment details:\n\n            Tracking Number: ${atheleteData.regNo}\n            Enrollment Number/Roll Number: ${AthleteEnrollmentDetails.enrollmentNumber}\n            Date of Expiry: ${validUntil}\n            Name: ${atheleteData.athleteName}\n\n            Please find your Athlete License attached below.\n\n            For any future correspondence, please use this email and the mobile number provided during registration.\n\n            Email: ${atheleteData.email}\n            Mobile: ${atheleteData.mob}\n\n            Thank you for registering with JKTA.\n\n            Best regards,\n            JKTA Team`,
                `<p>Dear ${atheleteData.athleteName},</p>
            <p>Congratulations! Your profile has been approved by JKTA. Below are your enrollment details:</p>
            <table>
            <tr>
                <td><strong>Tracking Number:</strong></td>
                <td>${atheleteData.regNo}</td>
            </tr>
            <tr>
                <td><strong>Enrollment Number/Roll Number:</strong></td>
                <td>${AthleteEnrollmentDetails.enrollmentNumber}</td>
            </tr>
            <tr>
                <td><strong>Date of Expiry:</strong></td>
                <td>${validUntil}</td>
            </tr>
            <tr>
                <td><strong>Name:</strong></td>
                <td>${atheleteData.athleteName}</td>
            </tr>
            </table>
            <p>Please find your Athlete License attached below.</p>
            <p>For any future correspondence, please use this email and the mobile number provided during registration.</p>
            <p><strong>Email:</strong> ${atheleteData.email}</p>
            <p><strong>Mobile:</strong> ${atheleteData.mob}</p>
            <p>Thank you for registering with JKTA.</p>
            <p>Best regards,<br>JKTA Team</p>`,
                `${atheleteData.regNo}-identity-card.pdf`,
                `./${atheleteData.regNo}-identity-card.pdf`
            );
        } catch (licenceError) {
            console.error(
                "Licence card generation/delivery failed:",
                licenceError && licenceError.message
            );
            licenceEmailResult = {
                sent: false,
                error: licenceError && licenceError.message
                    ? licenceError.message
                    : "Licence card generation failed",
            };
        } finally {
            // Best-effort temp cleanup; a retry regenerates the card.
            try {
                await deleteFiles(atheleteData.regNo);
            } catch (_) {
                /* ignore cleanup errors */
            }
        }

        // Persist the real delivery outcome so failures are visible and
        // retryable (the payment/registration is never lost).
        await Athelete.findByIdAndUpdate(atheleteData._id, {
            $set: {
                enrollmentNumber: AthleteEnrollmentDetails.enrollmentNumber,
                licenceEmailStatus: licenceEmailResult.sent ? "sent" : "failed",
                licenceEmailMessageId: licenceEmailResult.messageId || null,
                licenceEmailError: licenceEmailResult.sent
                    ? null
                    : licenceEmailResult.error || "Unknown error",
                licenceEmailAttempts: (atheleteData.licenceEmailAttempts || 0) + 1,
                licenceEmailLastAttemptAt: new Date(),
                ...(licenceEmailResult.sent ? { licenceIssuedAt: new Date() } : {}),
                licenceProcessingAt: null,
            },
        });

        return res.status(200).json({
            message: licenceEmailResult.sent
                ? "Athlete approved successfully. Licence card emailed."
                : "Athlete approved, but the licence card email failed. The failure was recorded and can be retried.",
            athlete,
            licenceEmailSent: licenceEmailResult.sent,
        });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};

const markStatusRejected = async (req, res) => {
    const regNo = req.params.regNo;

    console.log("RegNo:", regNo);

    const atheleteData = await Athelete.findOne({ regNo });

    if (!atheleteData) {
        return res.status(404).json({ message: "Athlete not found" });
    }

    await sendWithAttachment(
        atheleteData.email,
        `${atheleteData.regNo} - Your profile has been rejected`,
        `Dear ${atheleteData.athleteName},

        We regret to inform you that your profile has been rejected by JKTA. Below are the details:

        Tracking Number: ${atheleteData.regNo}
        Name: ${atheleteData.athleteName}
        Reason: Rejected by the admin, please contact the admin for more details.

        For any queries, please contact us at

        Email: ${process.env.ADMIN_EMAIL}
        Mobile: ${process.env.ADMIN_MOBILE}

        Thank you for registering with JKTA.
        `
    );

    const athlete = await Athelete.findOneAndUpdate(
        { regNo },
        { $set: { status: "rejected" } },
        { new: true }
    );

    if (!athlete) {
        return res.status(404).json({ message: "Athlete not found" });
    }

    res.status(200).json({
        message: "Athlete rejected successfully.",
        athlete,
    });
};

const getAtheleteDetails = async (req, res) => {
    try {
        const regNo = req.params.regNo;
        console.log("RegNo:", regNo);

        const athelete = await Athelete.findOne({ regNo });

        if (!athelete) {
            return res.status(404).json({ message: "Athlete not found" });
        }

        res.json(athelete);
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};

const updateAthelete = async (req, res) => {
    try {
        const regNo = req.params.regNo;
        console.log("Update RegNo:", regNo);

        const updateFields = {
            athleteName: req.body.athleteName,
            fatherName: req.body.fatherName,
            motherName: req.body.motherName,
            dob: req.body.dob,
            gender: req.body.gender,
            district: req.body.district,
            mob: req.body.mob,
            email: req.body.email,
            adharNumber: req.body.adharNumber,
            address: req.body.address,
            pin: req.body.pin,
            panNumber: req.body.panNumber,
            academyName: req.body.academyName,
            coachName: req.body.coachName,
            status: req.body.status,
        };

        const athelete = await Athelete.findOneAndUpdate(
            { regNo },
            { $set: updateFields },
            { new: true }
        );

        if (!athelete) {
            return res.status(404).json({ message: "Athlete not found" });
        }

        res.json({
            message: "Athlete updated successfully.",
            athelete,
            status: 200,
        });
    } catch (error) {
        console.log("Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
export {
    listAtheletes,
    pendingAtheletes,
    pendingAtheletesCount,
    allAtheletesCount,
    markStatusApproved,
    markStatusRejected,
    getAtheleteDetails,
    updateAthelete,
};
