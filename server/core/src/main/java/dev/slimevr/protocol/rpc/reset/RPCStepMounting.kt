package dev.slimevr.protocol.rpc

import com.google.flatbuffers.FlatBufferBuilder
import dev.slimevr.protocol.GenericConnection
import dev.slimevr.protocol.ProtocolAPI
import dev.slimevr.reset.accel.StepMountingListener
import dev.slimevr.tracking.processor.skeleton.UserHeightCalibrationListener
import solarxr_protocol.rpc.RpcMessage
import solarxr_protocol.rpc.RpcMessageHeader
import solarxr_protocol.rpc.StepMountingStatusResponse
import solarxr_protocol.rpc.StepMountingStatusResponseT
import solarxr_protocol.rpc.UserHeightRecordingStatusResponse
import solarxr_protocol.rpc.UserHeightRecordingStatusResponseT

class RPCStepMounting(var rpcHandler: RPCHandler, var api: ProtocolAPI) : StepMountingListener {
	val accelResetHandler = this.api.server.humanPoseManager.skeleton.accelResetHandler

	init {
		accelResetHandler?.addListener(this)
	}

	override fun onStatusChange(status: StepMountingStatusResponseT) {
		val fbb = FlatBufferBuilder(32)

		val res = StepMountingStatusResponse.pack(fbb, status)

		val outbound = rpcHandler.createRPCMessage(
			fbb,
			RpcMessage.StepMountingStatusResponse,
			res,
		)
		fbb.finish(outbound)

		api
			.apiServers.forEach { server ->
				server.apiConnections.forEach { conn ->
					conn.send(fbb.dataBuffer())
				}
			}
	}
}
