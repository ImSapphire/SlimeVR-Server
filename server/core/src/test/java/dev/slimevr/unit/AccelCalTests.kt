package dev.slimevr.unit

import com.jme3.math.FastMath
import dev.slimevr.unit.TrackerTestUtils.assertQuatApproxEqual
import dev.slimevr.unit.TrackerTestUtils.assertVectorApproxEqual
import io.github.axisangles.ktmath.Quaternion
import io.github.axisangles.ktmath.Vector3
import org.junit.jupiter.api.Test
import kotlin.math.abs
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

class AccelCalTests {
	fun centripetalAccel(rot1: Quaternion, rot2: Quaternion, length: Float, time: Float): Vector3 {
		// We only care about velocity magnitude for this, accel is always to the head
		val angleDiff = rot1.angleToR(rot2)

		// v = Angle diff as a ratio of the circumference by time
		// v = ((delta(angle) / 2pi) * (2pi * r)) / t
		// v = (delta(angle) * r) / t
		// a = Velocity squared over radius
		// a = v^2 / r
		// a = (delta(angle)^2 * r^2) / (t^2 * r)
		// a = (delta(angle)^2 * r) / t^2
		val centripetalAccelMag = (angleDiff * angleDiff * length) / (time * time)

		// Let's assume the initial state is the bone pointing down (-1 Y)
		// We take the opposite rotation vector of the current rotation to point back to the bone head
		return -((rot2 * rot1).sandwich(Vector3.NEG_Y) * centripetalAccelMag)
	}

	fun accelError(headAccel: Vector3, trackerAccel: Vector3, rot1: Quaternion, rot2: Quaternion, length: Float, time: Float, attachment: Quaternion, yaw: Quaternion): Float {
		// Local accel
		val adjRot1 = yaw * rot1 * attachment
		val adjRot2 = yaw * rot2 * attachment
		val centripetalAccel = centripetalAccel(adjRot1, adjRot2, length, time)

		// Global accel
		val adjAccel = (adjRot2 * attachment.inv()).sandwich(trackerAccel)
		val actualCentripetal = adjAccel - headAccel

		// Working without trackerPlacement, so magnitude of local accel is unknown
		// Primarily consider centripetal accel if it has reasonable magnitude
		return if (centripetalAccel.len() > 0.01f) {
			centripetalAccel.angleTo(actualCentripetal)
		} else {
			// Otherwise, consider global accel if it has reasonable magnitude
			if (headAccel.len() > 0.01f) {
				actualCentripetal.len()
			} else {
				// Otherwise just return -1 for invalid
				-1f
			}
		}
	}

	@Test
	fun accelTest() {
		// Assume frame 2 (or unspecified) is the present
		val headAccel = Vector3(0.2f, 0f, 0f)
		val length = 0.2f // Radius
		val trackerPlacement = 0.15f // How far down the length the tracker is
		val rot1 = Quaternion.IDENTITY
		val rot2 = Quaternion.rotationAroundZAxis(FastMath.QUARTER_PI)
		val time = 0.8f // Seconds between frame 1 and 2

		// This is the greatest local force on a tracker, let's assume no angular accel
		//  for now
		val centripetalAccel = centripetalAccel(rot1, rot2, length, time)

		// Both our accels should be world space now, so we can add them together
		// Centripetal accel will be a different magnitude based on tracker placement,
		//  so let's simulate that
		val trackerAccel = headAccel + (centripetalAccel * trackerPlacement)

		// Now we can apply a fake attachment (global) and yaw (local)
		val attachment = Quaternion(1f, 2f, 3f, 4f).unit()
		val yaw = Quaternion.rotationAroundYAxis(FastMath.HALF_PI)

		// Compute raw versions of our tracker data and ensure the re-calibrated raw
		//  values are equal to the original ones
		val rawRot1 = yaw.inv() * rot1 * attachment.inv()
		assertQuatApproxEqual(rot1, yaw * rawRot1 * attachment)
		val rawRot2 = yaw.inv() * rot2 * attachment.inv()
		assertQuatApproxEqual(rot2, yaw * rawRot2 * attachment)

		val rawTrackerAccel = (rot2 * attachment.inv()).inv().sandwich(trackerAccel)
		assertVectorApproxEqual(trackerAccel, (rot2 * attachment.inv()).sandwich(rawTrackerAccel))

		// Error should be about 0 if we have it right
		val knownError = accelError(headAccel, rawTrackerAccel, rawRot1, rawRot2, length, time, attachment, yaw)
		assertEquals(0f, knownError, FastMath.ZERO_TOLERANCE, null)

		// Now we have raw and calibrated rotations and local/global accel, let's derive
		//  our original attachment and yaw given the known head accel and raw tracker
		//  data :3

		// Let's start by assuming we don't have mounting, but have yaw
		var newAttachment = attachment.reject(Vector3.POS_Y).unit()

		// Now that we don't know attachment, the error should be higher
		val error = accelError(headAccel, rawTrackerAccel, rawRot1, rawRot2, length, time, newAttachment, yaw)
		assertNotEquals(0f, error, FastMath.ZERO_TOLERANCE, null)
	}
}
