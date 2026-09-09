export class ObservationInterrupted extends Error {
  constructor(code = "STREAM_INCOMPLETE") {
    super("Observation ended without reliable terminal evidence");
    this.name = "ObservationInterrupted";
    this.code = ["STREAM_INCOMPLETE", "STREAM_INVALID", "COLLECTOR_STOPPED", "PROCESS_UNAVAILABLE"].includes(code) ? code : "STREAM_INCOMPLETE";
  }
}
