package dev.slimevr.unit

import com.jme3.math.FastMath
import dev.slimevr.unit.TrackerTestUtils.assertQuatApproxEqual
import io.github.axisangles.ktmath.EulerAngles
import io.github.axisangles.ktmath.EulerOrder
import io.github.axisangles.ktmath.Quaternion
import io.github.axisangles.ktmath.Vector3
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

class AccelCalTests {
	data class Tracker(val boneLength: Float, val trackerPlacement: Float, val attachmentFix: Quaternion, val yawFix: Quaternion)
	data class TrackerFrame(val headAccel: Vector3, val rot: Quaternion, val accel: Vector3, val timeOffset: Float)

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

	fun centripetalAccel(tracker: Tracker, lastFrame: TrackerFrame, curFrame: TrackerFrame): Vector3 = centripetalAccel(lastFrame.rot, curFrame.rot, tracker.boneLength, curFrame.timeOffset)

	fun accelError(tracker: Tracker, oldFrame: TrackerFrame?, newFrame: TrackerFrame): Float {
		if (oldFrame == null) return 0f

		val calOldFrame = rawToCalib(tracker, null, oldFrame)
		val calNewFrame = rawToCalib(tracker, null, newFrame)

		val estimatedCentripetal = centripetalAccel(tracker, calOldFrame, calNewFrame)
		val actualCentripetal = calNewFrame.accel - calNewFrame.headAccel

		// Working without trackerPlacement, so magnitude of local accel is unknown
		// Primarily consider centripetal accel if it has reasonable magnitude
		return if (estimatedCentripetal.len() > 0.01f) {
			estimatedCentripetal.angleTo(actualCentripetal)
			// Or to estimate the placement too
			// ((estimatedCentripetal * tracker.trackerPlacement) - actualCentripetal).len()
		} else {
			// Otherwise, consider global accel if it has reasonable magnitude
			if (calNewFrame.headAccel.len() > 0.01f) {
				actualCentripetal.len()
			} else {
				// Otherwise just return -1 for invalid
				-1f
			}
		}
	}

	fun sumAccelError(tracker: Tracker, timeline: Array<TrackerFrame>): Float = transformTimeline(tracker, timeline, ::accelError).sumOf { e -> if (e >= 0f) e.toDouble() else 0.0 }.toFloat()

	inline fun <reified T> transformTimeline(tracker: Tracker, timeline: Array<TrackerFrame>, operation: (tracker: Tracker, oldFrame: TrackerFrame?, newFrame: TrackerFrame) -> T): Array<T> {
		if (timeline.isEmpty()) {
			return emptyArray<T>()
		}

		val newTimeline = arrayOfNulls<T>(timeline.size)
		for (i in timeline.indices) {
			val lastFrame = if (i > 0) timeline[i - 1] else null
			val frame = timeline[i]

			newTimeline[i] = operation(tracker, lastFrame, frame)
		}

		@Suppress("UNCHECKED_CAST")
		return newTimeline as Array<T>
	}

	fun estimateAccel(tracker: Tracker, oldFrame: TrackerFrame?, newFrame: TrackerFrame): TrackerFrame = if (oldFrame == null) {
		newFrame.copy(
			accel = newFrame.headAccel,
		)
	} else {
		val centripetalAccel = centripetalAccel(tracker, oldFrame, newFrame)
		newFrame.copy(
			accel = newFrame.headAccel + (centripetalAccel * tracker.trackerPlacement),
		)
	}

	fun calibToRaw(tracker: Tracker, oldFrame: TrackerFrame?, newFrame: TrackerFrame): TrackerFrame {
		val rawRot = tracker.yawFix.inv() * newFrame.rot * tracker.attachmentFix.inv()
		val rawAccel = (newFrame.rot * tracker.attachmentFix.inv()).inv().sandwich(newFrame.accel)

		return newFrame.copy(
			rot = rawRot,
			accel = rawAccel,
		)
	}

	fun rawToCalib(tracker: Tracker, oldFrame: TrackerFrame?, newFrame: TrackerFrame): TrackerFrame {
		val calRot = tracker.yawFix * newFrame.rot * tracker.attachmentFix
		val calAccel = (calRot * tracker.attachmentFix.inv()).sandwich(newFrame.accel)

		return newFrame.copy(
			rot = calRot,
			accel = calAccel,
		)
	}

	@Test
	fun accelTest() {
		val tracker = Tracker(
			0.2f,
			0.75f,
			Quaternion(1f, 2f, 3f, 4f).unit(),
			Quaternion.rotationAroundYAxis(FastMath.HALF_PI),
		)
		val timeline = transformTimeline(
			tracker,
			arrayOf(
				TrackerFrame(Vector3.NULL, Quaternion.IDENTITY, Vector3.NULL, 0f),
				TrackerFrame(
					Vector3(0.2f, 0f, 0f),
					Quaternion.rotationAroundZAxis(FastMath.QUARTER_PI),
					Vector3.NULL,
					0.8f,
				),
				TrackerFrame(
					Vector3(-0.2f, 0f, 0.3f),
					Quaternion.rotationAroundZAxis(FastMath.HALF_PI),
					Vector3.NULL,
					0.7f,
				),
				TrackerFrame(
					Vector3(0.0f, 0f, -0.3f),
					EulerAngles(EulerOrder.YZX, FastMath.QUARTER_PI, FastMath.QUARTER_PI, 0f).toQuaternion(),
					Vector3.NULL,
					1.0f,
				),
			),
			::estimateAccel,
		)
		val rawTimeline = transformTimeline(
			tracker,
			timeline,
			::calibToRaw,
		)

		// Error should be about 0 if we have it right
		val knownError = sumAccelError(tracker, rawTimeline)
		assertEquals(0f, knownError, FastMath.ZERO_TOLERANCE)

		// Let's start by assuming we don't have mounting, but have yaw
		val noMountingTracker = tracker.copy(
			attachmentFix = tracker.attachmentFix.reject(Vector3.POS_Y).unit(),
		)

		// Now that we don't know attachment, the error should be higher
		val error = sumAccelError(noMountingTracker, rawTimeline)
		assertNotEquals(0f, error, FastMath.ZERO_TOLERANCE)

		// TODO Insert optimization algorithm here

		val optimizedTracker = tracker.copy(
			// trackerPlacement = 0.75f,
			// attachmentFix = Quaternion.IDENTITY,
			// yawFix = Quaternion.IDENTITY,
		)
		val optimizeError = sumAccelError(optimizedTracker, rawTimeline)
		assertEquals(0f, optimizeError, FastMath.ZERO_TOLERANCE)

		assertEquals(tracker.trackerPlacement, optimizedTracker.trackerPlacement, FastMath.ZERO_TOLERANCE)
		assertQuatApproxEqual(tracker.attachmentFix, optimizedTracker.attachmentFix)
		assertQuatApproxEqual(tracker.yawFix, optimizedTracker.yawFix)
	}
}
