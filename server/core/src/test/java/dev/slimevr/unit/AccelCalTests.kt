package dev.slimevr.unit

import com.jme3.math.FastMath
import dev.slimevr.unit.TrackerTestUtils.assertQuatApproxEqual
import dev.slimevr.unit.TrackerTestUtils.assertVectorApproxEqual
import io.github.axisangles.ktmath.Quaternion
import io.github.axisangles.ktmath.Vector3
import org.junit.jupiter.api.Test

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

	@Test
	fun accelTest() {
		// Assume frame 2 (or unspecified) is the present
		val headAccel = Vector3(0.2f, 0f, 0f)
		val length = 0.2f // Radius
		val trackerPlacement = 0.15f // How far down the length the tracker is
		val rotation1 = Quaternion.IDENTITY
		val rotation2 = Quaternion.rotationAroundZAxis(FastMath.QUARTER_PI)
		val time = 0.8f // Seconds between frame 1 and 2

		// This is the greatest local force on a tracker, let's ignore angular accel for now
		val centripetalAccel = centripetalAccel(rotation1, rotation2, length, time)

		// Both our accels should be world space now, so we can add them together
		// Centripetal accel will be a different magnitude based on tracker placement,
		//  so let's simulate that
		val trackerAccel = headAccel + (centripetalAccel * trackerPlacement)

		// Now we can apply a fake attachment and yaw
		val attachment = Quaternion(1f, 2f, 3f, 4f).unit()
		val yaw = Quaternion.rotationAroundYAxis(FastMath.HALF_PI)

		// Compute raw versions of our tracker data and ensure the re-calibrated raw
		//  values are equal to the original ones
		val rawRotation2 = yaw.inv() * rotation2 * attachment.inv()
		assertQuatApproxEqual(rotation2, yaw * rawRotation2 * attachment)

		val rawTrackerAccel = (rotation2 * (attachment).inv()).inv().sandwich(trackerAccel)
		assertVectorApproxEqual(trackerAccel, (rotation2 * (attachment).inv()).sandwich(rawTrackerAccel))
	}
}
