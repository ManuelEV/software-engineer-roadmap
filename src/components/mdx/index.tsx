import type { MDXComponents } from 'mdx/types'
import { Pre } from './CodeBlock'
import { SmartLink } from './SmartLink'
import {
  Callout,
  CodeTabs,
  Compare,
  Details,
  Figure,
  Option,
  ProsCons,
  Quiz,
  Sidenote,
  Step,
  Steps,
  Table,
  Takeaways,
  Term,
} from './Blocks'
import { FlowDiagram } from '../diagrams/FlowDiagram'
import { Sketch } from '../diagrams/Sketch'
import './mdx.css'

/**
 * Components available in every MDX page without importing them.
 * Section-specific widgets are imported explicitly inside each .mdx file.
 */
export const mdxComponents: MDXComponents = {
  pre: Pre,
  a: SmartLink,
  table: Table,
  Callout,
  CodeTabs,
  Compare,
  Details,
  Figure,
  FlowDiagram,
  Option,
  ProsCons,
  Quiz,
  Sidenote,
  Sketch,
  Step,
  Steps,
  Takeaways,
  Term,
}
