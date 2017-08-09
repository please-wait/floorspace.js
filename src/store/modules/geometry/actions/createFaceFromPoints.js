import _ from 'lodash';
import factory from './../factory';
import geometryHelpers from './../helpers';
import modelHelpers from './../../models/helpers';
import { uniq, dropConsecutiveDups, allPairs } from './../../../../utilities';

/*
 * create a face and associated edges and vertices from an array of points
 * associate the face with the space or shading included in the payload
 */
export default function createFaceFromPoints(context, payload) {
  const {
    model_id,
    points,
  } = payload;

  if (uniq(points).length < 3) { return; }
  // lookup target model and type for face assignment
  const currentStoryGeometry = context.rootGetters['application/currentStoryGeometry'];
  const target = modelHelpers.libraryObjectWithId(context.rootState.models, model_id);

    // if the target already has an existing face, use the union of the new and existing faces
    const existingFace = target.face_id ? geometryHelpers.faceForId(target.face_id, currentStoryGeometry) : null;
    var facePoints;

    if (existingFace) {
        const existingFaceVertices = geometryHelpers.verticesForFaceId(existingFace.id, currentStoryGeometry);
        facePoints = geometryHelpers.setOperation('union', existingFaceVertices, points);
        if (!facePoints) {
            window.eventBus.$emit('error', 'Operation cancelled - no split faces');
            return;
        }
    } else {
        facePoints = points;
    }


    const faceGeometry = validateFaceGeometry(facePoints, context.rootGetters['application/currentStoryGeometry'], context.rootGetters['project/snapTolerance']);
    if (!faceGeometry.success) {
        window.eventBus.$emit('error', faceGeometry.error);
        console.error(faceGeometry.error);
        if (!faceGeometry.error) {
          debugger
        }
        return;
    }

    // prevent overlapping faces by erasing existing geometry covered by the points defining the new face
    if (!eraseSelection(facePoints, context) && !existingFace) {
      window.eventBus.$emit('error', 'Operation cancelled - no split faces');
      return;
    }

    // save the face and its descendent geometry
    storeFace(faceGeometry, target, context);

	// split edges where vertices touch them
    splitEdges(context);
    connectEdges(context);
}

//////////////////////// HELPERS //////////////////////////////

/*
 * Erase the selection defined by a set of points on all faces on the current story
 * used by the eraser tool and by the createFaceFromPoints action (to prevent overlapping faces)
 * returns false if the erase operation splits an existing face
 */
export function eraseSelection(points, context) {
    const currentStoryGeometry = context.rootGetters['application/currentStoryGeometry'];

    // validation - a selection must have at least 3 vertices and area
    if (points.length < 3 || !geometryHelpers.areaOfSelection(points)) {
        return;
    }

    /*
     * find all existing faces that have an intersection with the selection being erased
     * destroy faces intersecting the eraser selection and recreate them
     * from the difference between their original area and the eraser selection
     */
    const intersectedFaces = currentStoryGeometry.faces.filter((face) => {
        const faceVertices = geometryHelpers.verticesForFaceId(face.id, currentStoryGeometry),
            intersection = geometryHelpers.setOperation('intersection', faceVertices, points);
        return intersection.length;
    });

    // check that the operation is valid
    var validOperation = true;
    intersectedFaces.forEach((existingFace) => {
        const existingFaceVertices = geometryHelpers.verticesForFaceId(existingFace.id, currentStoryGeometry);
        if (!geometryHelpers.setOperation('difference', existingFaceVertices, points)) {
            validOperation = false;
        }
    });

    if (validOperation) {
        /*
         * destroy faces intersecting the eraser selection and recreate them
         * from the difference between their original area and the eraser selection
         */
        intersectedFaces.forEach((existingFace) => {
            const existingFaceVertices = geometryHelpers.verticesForFaceId(existingFace.id, currentStoryGeometry),
                affectedModel = modelHelpers.modelForFace(context.rootState.models, existingFace.id);

            // create new face by subtracting overlap (intersection) from the existing face's original area
            const differenceOfFaces = geometryHelpers.setOperation('difference', existingFaceVertices, points);
            // destroy existing face
            context.dispatch(affectedModel.type === 'space' ? 'models/updateSpaceWithData' : 'models/updateShadingWithData', {
                [affectedModel.type]: affectedModel,
                face_id: null
            }, {
                root: true
            });

            context.dispatch('destroyFaceAndDescendents', {
                geometry_id: currentStoryGeometry.id,
                face: existingFace
            });

            context.dispatch('createFaceFromPoints', {
                model_id: affectedModel.id,
                points: differenceOfFaces
            });
        });
        return true;
    } else {
        return false;
    }
}

/*
* saves the validated face geometry (edges and vertices) to the datastore
* skips shared edges and vertices since they are already stored
* creates and saves a face with edgeRefs, updates the target space or shading in the datastore
*/
function storeFace(faceGeometry, target, context) {
    const currentStoryGeometry = context.rootGetters['application/currentStoryGeometry'];

    faceGeometry.vertices.forEach((vertex) => {
        if (!geometryHelpers.vertexForId(vertex.id, currentStoryGeometry)) {
            context.commit('createVertex', {
                vertex: vertex,
                geometry_id: currentStoryGeometry.id
            });
        }
    });

    const edgeRefs = faceGeometry.edges.map((edge) => {
        var ref = {
            edge_id: edge.id,
            reverse: !!edge.reverse
        };
        delete edge.reverse;
        return ref;
    })
    const face = new factory.Face(edgeRefs);

    faceGeometry.edges.forEach((edge) => {
        if (!geometryHelpers.edgeForId(edge.id, currentStoryGeometry)) {
            context.commit('createEdge', {
                edge: edge,
                geometry_id: currentStoryGeometry.id
            });
        }
    });

    context.dispatch(target.type === 'space' ? 'models/updateSpaceWithData' : 'models/updateShadingWithData', {
        [target.type]: target,
        face_id: face.id
    }, {
        root: true
    });

    context.commit('createFace', {
        face: face,
        geometry_id: currentStoryGeometry.id
    });
}

export function findExistingEdge(v1, v2, edges) {
  const sharedEdge = edges.find(e => (
    (e.v1 === v1.id && e.v2 === v2.id) ||
    (e.v2 === v1.id && e.v1 === v2.id)));

  // if a shared edge exists, check if its direction matches the edge direction required for the face being created
  return sharedEdge && {
    ...sharedEdge,
    // this property will be used (then deleted) when we create and save the face with edgeRefs
    reverse: sharedEdge.v1 === v2.id,
  };
}

export function matchOrCreateEdges(vertices, existingEdges) {
   // pair each vertex with the next (wrapping back to start at the end)
  return _.zip(vertices, [...vertices.slice(1), vertices[0]])
  // try and find a shared edge, but fall back to creating a new one
    .map(([v1, v2]) => (findExistingEdge(v1, v2, existingEdges) || new factory.Edge(v1.id, v2.id)));
}

function InvalidFaceGeometry() {}
InvalidFaceGeometry.prototype = new Error();

export function errOnTooFewVerts(vertices) {
  if (vertices.length < 3) {
    throw new InvalidFaceGeometry(`can't make a polygon with fewer than three vertices: ${JSON.stringify(vertices)}`);
  }
}

export function errOnDuplicateVerts(vertices) {
  vertices.forEach((vertex) => {
    if (
      _.find(vertices, { x: vertex.x, y: vertex.y }).length >= 2
    ) {
      throw new InvalidFaceGeometry(`Duplicate vertex at (${vertex.x}, ${vertex.y})`);
    }
  });
}

export function errOnVertexIntersectsEdge(vertices, edges) {
  edges.forEach(({ v1: v1id, v2: v2id }) => {
    const
      v1 = _.find(vertices, { id: v1id }),
      v2 = _.find(vertices, { id: v2id });

    vertices.forEach((v) => {
      if (v.id === v1id || v.id === v2id) {
        return; // this is an endpoint of an edge under consideration.
      }

      if (!geometryHelpers.ptsAreCollinear(v1, v2, v)) {
        return;
      }

      // if the points *are* collinear, is v between v1 and v2?
      const positionAlongEdge = _.reject(
        [
          (v.x - v1.x) / (v2.x - v1.x),
          (v.y - v1.y) / (v2.y - v1.y),
        ],
        isNaN)[0];
      // positionAlongEdge = 0 implies v == v1
      // positionAlongEdge = 1 implies v == v2
      // positionAlongEdge > 1 or < 0 implies not on the line segment
      if (positionAlongEdge > 1 || positionAlongEdge < 0) {
        return;
      }
      throw new InvalidFaceGeometry(
        `An edge is being touched by a vertex on the same face at (${v.x}, ${v.y})`);
    });
  });
}

export function errOnEdgeIntersectsEdge(vertices, edges) {
  allPairs(edges).forEach(([e1, e2]) => {
    const
      e1v1 = _.find(vertices, { id: e1.v1 }),
      e1v2 = _.find(vertices, { id: e1.v2 }),
      e2v1 = _.find(vertices, { id: e2.v1 }),
      e2v2 = _.find(vertices, { id: e2.v2 });

    const intersection = geometryHelpers.intersectionOfLines(e1v1, e1v2, e2v1, e2v2);
    if (intersection) {
      throw new InvalidFaceGeometry(
        `Self intersection at ${intersection.x}, ${intersection.y}`);
    }
  });
}

/*
 * Given a set of points, creates vertices and edges for the face defined by the points
 * validates the face geometry for self intersection
 * returns object with success boolean and face geometry or error message depending on validation results
 */
export function validateFaceGeometry(points, currentStoryGeometry, snapTolerance) {
  /* validation consists of:
   - try and match each vertex to an existing one that is already in the geometry
   - create edges, and try to re-use existing ones (reversed, if necessary)
   - after snapping, check if any vertices were merged to the same point
     Duplicate vertices can cause two problems:
      1. zero-area portions of the face:

       1
        *---------------* 2
        |               |
        |               |3
        |               *-----* 4
        |               |5
        |               |
        *---------------* 6
       7
      2. not even actually a polygon:

        *                         *
        |\                         \
        | \                        \\
        |  \                       \\
        |   \          ====>       \\
        |    \                      \\
        |     \                     \\
        |      \                     \\
        *---@---*                    **

      @ is an existing point (on another face). Both * at the base of the triangle
      were snapped to the location of @, causing a degenerate polygon (just a line).

     Consecutive vertices are okay (we should combine them to a single example) as long
     as the total number of distinct vertices is at least 3.

   - Check if any vertices on the face lie on an edge in the face. Err out if they do.
     (this would cause either a zero-area portion of the face,
      eg: https://trello-attachments.s3.amazonaws.com/58d428743111af1d0a20cf28/598b740a2e569128b4392cb5/f71690195e4801010773652bac9d0a9c/capture.png
      or a split face.
      eg: https://trello-attachments.s3.amazonaws.com/58d428743111af1d0a20cf28/598b743607a58f375889faad/99ec60d5ddcf78c97db43e8628efa7b9/capture.png
     )
   - Check if two edges on the new face intersect. (again, to prevent split faces)
  */
  // build an array of vertices for the face being created
  let faceVertices = points.map(point => (
      // if a vertex already exists at a given location, reuse it
      // TODO once PR #118 is ready, remove snap tolerance again
    geometryHelpers.vertexForCoordinates(point, snapTolerance, currentStoryGeometry) || new factory.Vertex(point.x, point.y)
  ));


  // first, we can just join together consecutive duplicates, since that doesn't change
  // the geometry at all.
  faceVertices = dropConsecutiveDups(faceVertices);

  // create edges connecting each vertex in order
  const faceEdges = matchOrCreateEdges(faceVertices, currentStoryGeometry.edges);

  try {
    errOnTooFewVerts(faceVertices);
    errOnDuplicateVerts(faceVertices);
    errOnVertexIntersectsEdge(faceVertices, faceEdges);
    errOnEdgeIntersectsEdge(faceVertices, faceEdges);
  } catch (e) {
    if (e instanceof InvalidFaceGeometry) {
      return {
        success: false,
        error: `${e}`,
      };
    }
    // not an error we know about -- shouldn't have caught it
    // (...grumble, grumble javascript's underpowered exceptions...)
    throw e;
  }

  return {
    success: true,
    vertices: faceVertices,
    edges: faceEdges,
  };
}

/*
 * loop through all edges on the currentStoryGeometry, checking if there are any vertices touching (splitting) them
 * order the splitting vertices based on where they appear on the original edge
 * build and store a new set of edges by connecting the ordered splitting vertices
 * look up all faces referencing the original edge and replace those references with references to the new edges
 * destroy the original edge
 */
function splitEdges(context) {
    const currentStoryGeometry = context.rootGetters['application/currentStoryGeometry'];

    currentStoryGeometry.edges.forEach((edge) => {
        const splittingVertices = geometryHelpers.splittingVerticesForEdgeId(edge.id, currentStoryGeometry);
        if (splittingVertices.length) {
            // endpoints of the original edge
            const startpoint = geometryHelpers.vertexForId(edge.v1, currentStoryGeometry),
                endpoint = geometryHelpers.vertexForId(edge.v2, currentStoryGeometry);

            // sort splittingVertices by location on original edge
            splittingVertices.sort((va, vb) => {
                const vaDist = Math.sqrt(
                        Math.pow(Math.abs(va.x - startpoint.x), 2) +
                        Math.pow(Math.abs(va.y - startpoint.y), 2)
                    ),
                    vbDist = Math.sqrt(
                        Math.pow(Math.abs(vb.x - startpoint.x), 2) +
                        Math.pow(Math.abs(vb.y - startpoint.y), 2)
                    );

                // compare distance from vertices to original edge startpoint
                return vaDist > vbDist;
            });

            // add startpoint and endpoint of original edge to splittingVertices array from which new edges will be created
            splittingVertices.unshift(startpoint);
            splittingVertices.push(endpoint);

            // create new edges by connecting the original edge startpoint, ordered splitting vertices, and original edge endpoint
            // eg: startpoint -> SV1, SV1 -> SV2, SV2 -> SV3, SV3 -> endpoint
            const newEdges = [];
            for (var i = 0; i < splittingVertices.length - 1; i++) {
                const newEdgeV1 = splittingVertices[i],
                    newEdgeV2 = splittingVertices[i + 1],
                    newEdge = new factory.Edge(newEdgeV1.id, newEdgeV2.id);
                context.commit('createEdge', {
                    edge: newEdge,
                    geometry_id: currentStoryGeometry.id
                });
                newEdges.push(newEdge);
            }

            // look up all faces with a reference to the original edge being split
            const affectedFaces = geometryHelpers.facesForEdgeId(edge.id, currentStoryGeometry);

            // remove reference to old edge and add references to the new edges
            affectedFaces.forEach((affectedFace) => {
                context.commit('destroyEdgeRef', {
                    geometry_id: currentStoryGeometry.id,
                    edge_id: edge.id,
                    face_id: affectedFace.id
                });

                newEdges.forEach((newEdge) => {
                    context.commit('createEdgeRef', {
                        geometry_id: currentStoryGeometry.id,
                        face_id: affectedFace.id,
                        edgeRef: {
                            edge_id: newEdge.id,
                            reverse: false
                        }
                    });
                })
            });

            // destroy original edge
            context.commit('destroyGeometry', {
                id: edge.id
            });
        }
        // connectEdges(currentStoryGeometry, context);
    });
}

/*
 * order the edgeRefs on each face on the currentStoryGeometry so that all edges are connected from startpoint to endpoint
 * set reverse property on edgeRefs as needed
 */
function connectEdges(context) {
    const currentStoryGeometry = context.rootGetters['application/currentStoryGeometry'];
    currentStoryGeometry.faces.forEach((face) => {
        const faceEdges = geometryHelpers.edgesForFaceId(face.id, currentStoryGeometry);

        // initialize ordered edgeRef array with our origin edge
        const connectedEdgeRefs = [];
        var reverse = false;

        // pick an arbitrary edge (edges[0]) and treat its v2 as the endpoint
        // all ordering will assume this edge's v1 as the origin of the face
        var nextEdge = faceEdges[0],
            endpoint = nextEdge.v2;

        while (connectedEdgeRefs.length < faceEdges.length) {
            connectedEdgeRefs.push({
                edge_id: nextEdge.id,
                reverse: reverse
            });
            reverse = false;

            // each vertex must be referenced by exactly two edges, it acts as the endpoint for the first edge and the startpoint for the next
            // look up the next edge by finding the edge on the face referencing the endpoint of the current edge
            nextEdge = faceEdges.find((e) => {
                if (e.id === nextEdge.id) {
                    return;
                }
                if ((e.v2 === endpoint || e.v1 === endpoint) && e !== faceEdges[0] && ~connectedEdgeRefs.map(eR => eR.edge_id)
                    .indexOf(e.id)) {
                    // TODO: sometimes multiple edges reference the same endpoint, causing duplicated in the connectedEdgeRefs array. not sure why this is happening.
                    return false;
                }
                // if the next edge is connected to the endpoint of the current edge by its v2 and not its v1, it is reversed
                if (e.v2 === endpoint) {
                    reverse = true;
                    endpoint = e.v1;
                    return true;
                } else if (e.v1 === endpoint) {
                    endpoint = e.v2;
                    return true;
                }
            });
            if (nextEdge === faceEdges[0]) {
                break;
            }
        }

        // update the face with the ordered edge refs
        context.commit('setEdgeRefsForFace', {
            geometry_id: currentStoryGeometry.id,
            face_id: face.id,
            edgeRefs: connectedEdgeRefs
        });
    });
}
