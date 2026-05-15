// Fix React Navigation + React 18 JSX type compatibility
// See: https://github.com/react-navigation/react-navigation/issues/11692
import "@react-navigation/native";

declare global {
  namespace JSX {
    interface Element extends React.ReactElement<unknown, string | React.JSXElementConstructor<unknown>> {}
  }
}
