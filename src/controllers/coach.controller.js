import { ObjectId } from "mongodb";
import Coach from "../models/coach.model.js";
import mongoose from "mongoose";
import { deleteFiles, generateCard } from "../utils/idcard.js";
import CoachEnrollment from "../models/coachEnrollment.model.js";
import { sendWithAttachment } from "./mail.controller.js";
import { downloadImage } from "../utils/downloadImage.js";
import expiryDate from "../utils/expiryDate.js";

const listCoaches = async (req, res) => {
    try {
        // const coaches = await Coach.find({
        //     payment: true,
        // });

        const coaches = await Coach.find(); // find all coaches - 5feb 2025 as per request

        // sort the coaches by status pending, approved, rejected
        coaches.sort((a, b) => {
            if (a.status === "pending" && b.status !== "pending") return -1;
            if (a.status !== "pending" && b.status === "pending") return 1;
            if (a.status === "approved" && b.status === "rejected") return -1;
            if (a.status === "rejected" && b.status === "approved") return 1;
            return 0;
        });

        res.json(coaches);
    } catch (error) {
        res.json({ message: error.message });
    }
};

const pendingCoaches = async (req, res) => {
    try {
        const coaches = await Coach.find({
            status: "pending",
            // payment: true,
        });
        res.json(coaches);
    } catch (error) {
        res.json({ message: error.message });
    }
};

const pendingCoachesCount = async (req, res) => {
    try {
        const count = await Coach.countDocuments({
            status: "pending",
            // payment: true,
        });
        res.json({ count });
    } catch (error) {
        res.json({ message: error.message });
    }
};

const allCoachesCount = async (req, res) => {
    try {
        // const count = await Coach.countDocuments({
        //     payment: true,
        // });

        const count = await Coach.countDocuments(); // count all coaches - 5feb 2025 as per request
        
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
        const coachData = await Coach.findOne({ regNo });

        if (!coachData.photo) {
            return res.status(404).json({
                message:
                    "Photo not found, Without photo, profile can't be approved",
            });
        }

        // check if id is available in CoachEnrollment (regNo field)
        const isEnrolled = await CoachEnrollment.findOne({
            regNo: coachData._id,
        });

        // generate enrollment number
        let CoachEnrollmentDetails;
        if (isEnrolled) {
            CoachEnrollmentDetails = isEnrolled;
        } else {
            const CoachEnrollmentCount = await CoachEnrollment.countDocuments(); // as it returns a promise
            CoachEnrollmentDetails = await CoachEnrollment.create({
                enrollmentNumber: `JKTA${10000 + CoachEnrollmentCount + 1}`,
                regNo: coachData._id,
            });
        }

        console.log(CoachEnrollmentDetails);

        const coach = await Coach.findOneAndUpdate(
            { regNo },
            { $set: { status: "approved" } },
            { new: true }
        );

        if (!coach) {
            return res.status(404).json({ message: "Coach not found" });
        }

        // Skip re-sending when the card was already delivered (e.g. the
        // public backend issues it automatically on verified payment).
        if (coachData.licenceEmailStatus === "sent") {
            return res.status(200).json({
                message: "Coach approved successfully. Licence card was already delivered.",
                coach,
                licenceEmailSent: true,
            });
        }

        const validUntil = expiryDate(coachData.createdAt);
        let licenceEmailResult = { sent: false, error: null };

        try {
            await downloadImage(coachData.photo, `${coachData.regNo}-download.png`);

            await generateCard({
                id: coachData.regNo,
                enrollmentNo: CoachEnrollmentDetails.enrollmentNumber,
                type: "C",
                name: coachData.playerName,
                parentage: coachData.fatherName,
                gender: coachData.gender,
                valid: validUntil,
                district: coachData.district,
                dob: `${coachData.dob}`,
            });

            licenceEmailResult = await sendWithAttachment(
                coachData.email,
                `${CoachEnrollmentDetails.enrollmentNumber} - Congratulations, your profile has been approved`,
                `Dear ${coachData.playerName},\n\n            Congratulations! Your profile has been approved by JKTA. Below are your enrollment details:\n\n            Tracking Number: ${coachData.regNo}\n            Enrollment Number/Roll Number: ${CoachEnrollmentDetails.enrollmentNumber}\n            Date of Expiry: ${validUntil}\n            Name: ${coachData.playerName}\n\n            Please find your Coach License attached below.\n\n            For any future correspondence, please use this email and the mobile number provided during registration.\n\n            Email: ${process.env.ADMIN_EMAIL}\n            Mobile: ${process.env.ADMIN_MOBILE}\n\n            Thank you for registering with JKTA.\n\n            Best regards,\n            JKTA Team`,
                `<p>Dear ${coachData.playerName},</p>
            <p>Congratulations! Your profile has been approved by JKTA. Below are your enrollment details:</p>
            <table>
            <tr>
                <td><strong>Tracking Number:</strong></td>
                <td>${coachData.regNo}</td>
            </tr>
            <tr>
                <td><strong>Enrollment Number/Roll Number:</strong></td>
                <td>${CoachEnrollmentDetails.enrollmentNumber}</td>
            </tr>
            <tr>
                <td><strong>Date of Expiry:</strong></td>
                <td>${validUntil}</td>
            </tr>
            <tr>
                <td><strong>Name:</strong></td>
                <td>${coachData.playerName}</td>
            </tr>
            </table>
            <p>Please find your Coach License attached below.</p>
            <p>For any future correspondence, please use this email and the mobile number provided during registration.</p>
            <p><strong>Email:</strong> ${coachData.email}</p>
            <p><strong>Mobile:</strong> ${coachData.mob}</p>
            <p>Thank you for registering with JKTA.</p>
            <p>Best regards,<br>JKTA Team</p>`,
                `${coachData.regNo}-identity-card.pdf`,
                `./${coachData.regNo}-identity-card.pdf`
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
            try {
                await deleteFiles(coachData.regNo);
            } catch (_) {
                /* ignore cleanup errors */
            }
        }

        await Coach.findByIdAndUpdate(coachData._id, {
            $set: {
                enrollmentNumber: CoachEnrollmentDetails.enrollmentNumber,
                licenceEmailStatus: licenceEmailResult.sent ? "sent" : "failed",
                licenceEmailMessageId: licenceEmailResult.messageId || null,
                licenceEmailError: licenceEmailResult.sent
                    ? null
                    : licenceEmailResult.error || "Unknown error",
                licenceEmailAttempts: (coachData.licenceEmailAttempts || 0) + 1,
                licenceEmailLastAttemptAt: new Date(),
                ...(licenceEmailResult.sent ? { licenceIssuedAt: new Date() } : {}),
                licenceProcessingAt: null,
            },
        });

        return res.status(200).json({
            message: licenceEmailResult.sent
                ? "Coach approved successfully. Licence card emailed."
                : "Coach approved, but the licence card email failed. The failure was recorded and can be retried.",
            coach,
            licenceEmailSent: licenceEmailResult.sent,
        });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};

const markStatusRejected = async (req, res) => {
    const regNo = req.params.regNo;

    console.log("RegNo:", regNo);

    const coachData = await Coach.findOne({ regNo });

    if (!coachData) {
        return res.status(404).json({ message: "Coach not found" });
    }

    await sendWithAttachment(
        coachData.email,
        `${coachData.regNo} - Your profile has been rejected`,
        `Dear ${coachData.playerName},

        We regret to inform you that your profile has been rejected by JKTC. Below are the details:

        Tracking Number: ${coachData.regNo}
        Name: ${coachData.playerName}
        Reason: Rejected by the admin, please contact the admin for more details.

        For any queries, please contact us at

        Email: ${process.env.ADMIN_EMAIL}
        Mobile: ${process.env.ADMIN_MOBILE}

        Thank you for registering with JKTC.
        `
    );

    const coach = await Coach.findOneAndUpdate(
        { regNo },
        { $set: { status: "rejected" } },
        { new: true }
    );

    if (!coach) {
        return res.status(404).json({ message: "Coach not found" });
    }

    res.status(200).json({
        message: "Coach rejected successfully.",
        coach,
    });
};

const getCoachDetails = async (req, res) => {
    try {
        const regNo = req.params.regNo;

        const coach = await Coach.findOne({ regNo });

        if (!coach) {
            return res.status(404).json({ message: "Coach not found" });
        }

        res.json(coach);
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};

const updateCoach = async (req, res) => {
    try {
        const regNo = req.params.regNo;

        const updateFields = {
            playerName: req.body.playerName,
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
            status: req.body.status,
        };

        const coach = await Coach.findOneAndUpdate(
            { regNo },
            { $set: updateFields },
            { new: true }
        );

        if (!coach) {
            return res.status(404).json({ message: "Coach not found" });
        }

        res.json({
            message: "Coach updated successfully.",
            coach,
            status: 200,
        });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};

export {
    listCoaches,
    pendingCoaches,
    pendingCoachesCount,
    allCoachesCount,
    markStatusApproved,
    markStatusRejected,
    getCoachDetails,
    updateCoach,
};
