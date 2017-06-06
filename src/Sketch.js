/* globals Hammer, THREE */
/* eslint jsx-a11y/img-redundant-alt: off */
import React, { Component } from 'react';
import isEqual from 'lodash.isequal';

import degToRad from './utils/degToRad';
import initializeRenderer from './utils/initializeRenderer';
import { initializeArToolkit, getMarker } from './utils/arToolkit';
import './Sketch.css';
import hiro from './assets/hiro.png';
import pan from './assets/pan.png';
import pinch from './assets/pinch.png';
import rotate from './assets/rotate.png';
import Settings from './Settings';
import detectEdge from './utils/detectEdge';

const { Camera, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Scene, Texture } = THREE;

class Sketch extends Component {
    state = {
        showTips: true,
        markerFound: false,
        opacity: 1,
        isDetectingEdge: false,
        blur: 2,
        highTreshold: 20,
        lowTreshold: 50,
        pan: {
            startX: 1,
            startZ: 2,
            x: 1,
            z: 2,
        },
        rotation: {
            z: 0,
        },
        scale: {
            x: 2,
            y: 2,
        }
    };


    renderer = null;

    handlePan = (ev) => {
        if (ev.type === 'panstart') {
            this.setState({
                ...this.state,
                pan: {
                    ...this.state.pan,
                    startX: this.state.pan.x,
                    startZ: this.state.pan.z,
                },
            });
        }
        this.setState({
            ...this.state,
            pan: {
                ...this.state.pan,
                x: this.state.pan.startX + ev.deltaX / 200,
                z: this.state.pan.startZ + ev.deltaY / 200,
            },
        });
    }

    handlePinch = (ev) => {
        if (ev.type === 'pinchstart') {
            this.setState({
                ...this.state,
                scale: {
                    ...this.state.scale,
                    startX: this.state.scale.x,
                    startY: this.state.scale.y,
                },
            });
        }
        this.setState({
            ...this.state,
            scale: {
                ...this.state.scale,
                x: this.state.scale.startX * ev.scale,
                y: this.state.scale.startY * ev.scale,
            },
        });
    }

    handleRotate = (ev) => {
        if (ev.type === 'rotatestart') {
            this.setState({
                ...this.state,
                rotation: {
                    ...this.state.rotation,
                    start: this.state.rotation.z + degToRad(ev.rotation), // the first rotation is the angle between the two finger ignoring it.
                },
            });
            return;
        }
        this.setState({
            ...this.state,
            rotation: {
                ...this.state.rotation,
                z: this.state.rotation.start - degToRad(ev.rotation),
            },
        });
    }

    renderMesh = () => {
        const { pan: { x, z }, opacity, isDetectingEdge, blur, lowTreshold, highTreshold } = this.state;
        this.mesh.position.x = x;
        this.mesh.position.z = z;
        this.mesh.rotation.z = this.state.rotation.z;
        this.mesh.scale.x = this.state.scale.x;
        this.mesh.scale.y = this.state.scale.y;
        this.mesh.needsUpdate = true;
    }

    renderMaterial = () => {
        const { blackImage, image } = this.props;
        const { opacity, isDetectingEdge, blur, lowTreshold, highTreshold } = this.state;
        if (isDetectingEdge) {
            this.material.opacity = 1;
            const alphaImage = detectEdge(image, { blur, lowTreshold, highTreshold });
            const alphaTexture = new Texture(alphaImage);
            alphaTexture.needsUpdate = true;
            this.material.alphaMap = alphaTexture;
            this.material.map.image = blackImage;
            this.material.map.image.needsUpdate = true;
            this.material.map.needsUpdate = true;
        } else {
            this.material.opacity = opacity;
            this.material.alphaMap = null;
            const texture = new Texture(image);
            texture.needsUpdate = true;
            this.material.map = texture;
        }
        this.material.needsUpdate = true;
    }

    componentDidMount() {
        const { opacity } = this.state;
        const renderer = this.renderer = initializeRenderer(this.canvas);

        const scene = new Scene();
        const camera = new Camera();
        scene.add(camera);

        const markerRoot = new Group();
        scene.add(markerRoot);
        const onRenderFcts = [];
        const arToolkitContext = initializeArToolkit(renderer, camera, onRenderFcts);
        const marker = getMarker(arToolkitContext, markerRoot);

        marker.addEventListener('markerFound', () => {
            this.setState({ markerFound: true });
        });

        const geometry = new PlaneGeometry(1, 1, 1);
        const texture = new Texture(this.props.image);
        texture.needsUpdate = true;

        this.material = new MeshBasicMaterial({
            map: texture,
            opacity,
            side: DoubleSide,
            transparent: true,
        });

        this.mesh = new Mesh(geometry, this.material);
        this.mesh.rotation.x = - Math.PI / 2; // -90°

        markerRoot.add(this.mesh);

        // render the scene
        onRenderFcts.push(function(){
            renderer.render(scene, camera);
        });

        // run the rendering loop
        var lastTimeMsec = null;

        function animate(nowMsec) {
            // keep looping
            requestAnimationFrame(animate);
            // measure time
            lastTimeMsec = lastTimeMsec || nowMsec - 1000 / 60;
            const deltaMsec = Math.min(200, nowMsec - lastTimeMsec);
            lastTimeMsec = nowMsec;
            // call each update function
            onRenderFcts.forEach(onRenderFct => {
                onRenderFct(deltaMsec / 1000, nowMsec / 1000);
            });
        }
        requestAnimationFrame(animate);

        const hammer = new Hammer(this.canvas);

        hammer.get('pinch').set({ enable: true });
        hammer.get('rotate').set({ enable: true });
        hammer.get('pan').set({ direction: Hammer.DIRECTION_ALL });

        hammer.on('panstart', this.handlePan);

        hammer.on('panmove', this.handlePan);

        hammer.on('pinchstart', this.handlePinch);

        hammer.on('pinch', this.handlePinch);

        let rotateStart;

        hammer.on('rotatestart', this.handleRotate);

        hammer.on('rotatemove', this.handleRotate);
    }

    componentWillUnmount() {
        this.renderer.dispose();
    }

    shouldComponentUpdate(nextProps, state) {
        return !isEqual(state, this.state);
    }

    storeRef = node => {
        this.canvas = node;
    }

    handleOpacityChange = event =>
        this.setState({
            ...this.state,
            opacity: event.target.value,
        });

    handleBack = () => {
        // We can't reset the AR.js created elements (no dispose, reset or destroy methods available)
        window.location.reload();
    }

    handleDetectEdgeChange = () =>
        this.setState({
            ...this.state,
            isDetectingEdge: !this.state.isDetectingEdge,
        });

    handleBlurChange = (event) =>
        this.setState({
            ...this.state,
            blur: event.target.value,
        });

    handleLowTresholdChange = (event) =>
        this.setState({
            ...this.state,
            lowTreshold: event.target.value,
        });

    handleHighTresholdChange = (event) =>
        this.setState({
            ...this.state,
            highTreshold: event.target.value,
        });

    handleHideTips = () =>
        this.setState({
            ...this.state,
            showTips: false,
        });

    render() {
        const { markerFound, showTips, opacity, isDetectingEdge, blur, lowTreshold, highTreshold } = this.state;
        if (this.mesh) {
            this.renderMesh();
        }
        if (this.material) {
            this.renderMaterial();
        }

        return (
            <div>
                <canvas id="root" ref={this.storeRef} />
                {!markerFound &&
                    <div className="MarkerSearchContainer">
                        <div className="MarkerSearch">
                            Looking for Hiro Marker
                            <img alt="Hiro marker example" src={hiro} />
                        </div>
                    </div>
                }
                {markerFound && showTips &&
                    <div className="tips" onClick={this.handleHideTips}>
                        <div className="item">
                            <img alt="How to move the image" src={pan} />
                            <div className="text">Pan with your finger to drag the picture on the paper</div>
                        </div>
                        <div className="item">
                            <img alt="How to zoom the image" src={pinch} />
                            <div className="text">Pinch to zoom the picture in or out and fit the sheet</div>
                        </div>
                        <div className="item">
                            <img alt="How to rotate the image" src={rotate} />
                            <div className="text">Rotate your fingers to rotate the picture and orient it on the sheet</div>
                        </div>
                    </div>
                }
                <button className="backButton btn" onClick={this.handleBack}>Back</button>
                <Settings
                    opacity={opacity}
                    blur={blur}
                    lowTreshold={lowTreshold}
                    highTreshold={highTreshold}
                    isDetectingEdge={isDetectingEdge}
                    onOpacityChange={this.handleOpacityChange}
                    onDetectEdgeChange={this.handleDetectEdgeChange}
                    onBlurChange={this.handleBlurChange}
                    onLowTresholdChange={this.handleLowTresholdChange}
                    onHighTresholdChange={this.handleHighTresholdChange}
                />
            </div>
        );
    }
}

export default Sketch;
