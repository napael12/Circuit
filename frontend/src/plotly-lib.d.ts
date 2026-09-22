// plotly.js's modular entry points ship no typings of their own -- core is the same API
// @types/plotly.js describes; the trace modules are opaque values handed to Plotly.register.
declare module 'plotly.js/lib/core' {
  import * as Plotly from 'plotly.js'
  export = Plotly
}
declare module 'plotly.js/lib/bar' {
  const traceModule: unknown
  export = traceModule
}
declare module 'plotly.js/lib/heatmap' {
  const traceModule: unknown
  export = traceModule
}
declare module 'plotly.js/lib/pie' {
  const traceModule: unknown
  export = traceModule
}
declare module 'plotly.js/lib/scatter' {
  const traceModule: unknown
  export = traceModule
}
